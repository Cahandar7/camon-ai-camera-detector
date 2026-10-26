"""Camera workers and the manager that owns them.

Each camera runs two threads that never wait on each other:

  reader    — pulls frames from the source as fast as the camera sends them and
              keeps only the newest one (no queue → latency never builds up).
  inference — whenever it is free, takes the newest frame, runs YOLO + tracking and
              publishes detections. Frames that arrive while the model is busy are
              simply skipped for AI, but still go to the browser.

The browser therefore shows video at the camera's full frame rate and draws the
boxes itself on a canvas overlay, instead of receiving re-encoded annotated frames.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import uuid
from collections import deque
from pathlib import Path

import cv2
from pydantic import BaseModel, Field

from .analytics import ZoneAnalytics
from .config import DATA_DIR, SNAPSHOTS_DIR, VIDEOS_DIR, RuntimeStore, settings
from .detector import CATEGORIES, Detection, Detector
from .sources import Frame, open_source

log = logging.getLogger("camon")


class CameraIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    zone: str = Field("", max_length=60)
    url: str = Field(min_length=1, max_length=500)
    enabled: bool = True


class Camera(CameraIn):
    id: str


class Hub:
    """Hands the latest value from a worker thread to any number of async readers."""

    def __init__(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop
        self._event = asyncio.Event()
        self.version = 0
        self.value = None

    def publish(self, value) -> None:  # any thread
        try:
            self._loop.call_soon_threadsafe(self._set, value)
        except RuntimeError:  # loop closed during shutdown
            pass

    def _set(self, value) -> None:
        self.value = value
        self.version += 1
        event, self._event = self._event, asyncio.Event()
        event.set()

    async def next(self, after: int, timeout: float):
        while self.version <= after:
            await asyncio.wait_for(self._event.wait(), timeout)
        return self.version, self.value


class FpsMeter:
    def __init__(self, window: float = 2.0):
        self._ts: deque[float] = deque()
        self._window = window

    def tick(self) -> None:
        now = time.monotonic()
        self._ts.append(now)
        while self._ts and now - self._ts[0] > self._window:
            self._ts.popleft()

    @property
    def value(self) -> float:
        ts = self._ts
        if len(ts) < 2 or time.monotonic() - ts[-1] > self._window:
            return 0.0
        return round((len(ts) - 1) / (ts[-1] - ts[0]), 1)


class CameraWorker:
    def __init__(self, cam: Camera, manager: CameraManager):
        self.cam = cam
        self.manager = manager
        self.frames = Hub(manager.loop)  # raw frames → MJPEG stream (only while watched)
        self.results = Hub(manager.loop)  # detections + stats → WebSocket
        self.status = "disabled" if not cam.enabled else "connecting"
        self.error = ""
        self.viewers = 0
        self.analytics = ZoneAnalytics()
        self.source_fps = FpsMeter()
        self.ai_fps = FpsMeter()
        self.ai_ms = 0.0
        self.resolution: tuple[int, int] | None = None
        self.last_stats: dict | None = None
        self.latest: Frame | None = None
        self._seq = 0
        self._cond = threading.Condition()
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    def start(self) -> None:
        if not self.cam.enabled:
            return
        for target, name in ((self._read_loop, "reader"), (self._infer_loop, "ai")):
            t = threading.Thread(target=target, name=f"{self.cam.id}-{name}", daemon=True)
            t.start()
            self._threads.append(t)

    def stop(self) -> None:
        self._stop.set()
        with self._cond:
            self._cond.notify_all()

    def summary(self) -> dict:
        s = self.last_stats or {}
        return {
            "id": self.cam.id,
            "status": self.status,
            "error": self.error,
            "score": s.get("score"),
            "level": s.get("level"),
            "people": s.get("people", 0),
            "litter": s.get("litter", 0),
            "alert": s.get("alert", ""),
            "fps": {"camera": self.source_fps.value, "ai": self.ai_fps.value},
        }

    # --- reader thread -------------------------------------------------------------

    def _read_loop(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            self.status = "connecting"
            try:
                for frame in open_source(self.cam.url, self._stop):
                    if self.viewers and frame.jpeg is None:
                        frame.encode(settings.stream_quality)
                    with self._cond:
                        self.latest = frame
                        self._seq += 1
                        self._cond.notify_all()
                    if self.viewers:
                        self.frames.publish(frame)
                    self.source_fps.tick()
                    if self.status != "online":
                        self.status, self.error, backoff = "online", "", 1.0
                        log.info("[%s] online", self.cam.name)
            except Exception as exc:  # network errors, bad URL, camera app closed...
                self.error = str(exc) or exc.__class__.__name__
                log.warning("[%s] source error: %s", self.cam.name, self.error)
            if self._stop.is_set():
                break
            self.status = "offline"
            self._stop.wait(backoff)
            backoff = min(backoff * 2, 8.0)

    # --- inference thread ----------------------------------------------------------

    def _infer_loop(self) -> None:
        detector: Detector | None = None
        seen = 0
        min_period = 1.0 / settings.max_ai_fps if settings.max_ai_fps > 0 else 0.0
        while not self._stop.is_set():
            with self._cond:
                while self._seq == seen and not self._stop.is_set():
                    self._cond.wait(1.0)
                frame, seen = self.latest, self._seq
            if self._stop.is_set() or frame is None:
                break
            started = time.perf_counter()
            try:
                if detector is None:
                    detector = self.manager.create_detector()
                img = frame.decode(min_width=settings.imgsz)
                cfg = self.manager.runtime.value
                dets = detector(img, cfg.confidence)
            except Exception:
                log.exception("[%s] inference failed", self.cam.name)
                self._stop.wait(1.0)
                continue
            self.ai_ms = (time.perf_counter() - started) * 1000
            self.ai_fps.tick()
            self.resolution = frame.size() or (img.shape[1], img.shape[0])

            stats, point, events = self.analytics.update(dets, cfg)
            self.last_stats = stats
            for event in events:
                self._raise_event(event, frame, dets)
            self.results.publish({
                "type": "result",
                "ts": round(frame.ts, 3),
                "fps": {"camera": self.source_fps.value, "ai": self.ai_fps.value},
                "latency_ms": round(self.ai_ms, 1),
                "resolution": self.resolution,
                "detections": [_det_json(d) for d in dets],
                "stats": stats,
                "point": point,
            })

            spare = min_period - (time.perf_counter() - started)
            if spare > 0:
                self._stop.wait(spare)

    def _raise_event(self, event: dict, frame: Frame, dets: list[Detection]) -> None:
        event_id = uuid.uuid4().hex[:12]
        event.update(
            id=event_id,
            ts=time.time(),
            camera_id=self.cam.id,
            camera_name=self.cam.name,
            zone=self.cam.zone,
            snapshot=None,
        )
        try:
            path = SNAPSHOTS_DIR / f"{event_id}.jpg"
            cv2.imwrite(str(path), _annotate(frame.decode(), dets), [cv2.IMWRITE_JPEG_QUALITY, 85])
            event["snapshot"] = f"/api/snapshots/{path.name}"
        except Exception:
            log.exception("snapshot failed")
        log.info("[%s] %s: %s", self.cam.name, event["title"], event["message"])
        self.manager.emit(event)


class CameraManager:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.workers: dict[str, CameraWorker] = {}
        self.runtime = RuntimeStore(DATA_DIR / "settings.json")
        self.alerts: deque[dict] = deque(maxlen=200)
        self.model_path: Path | None = None
        self._subscribers: set[asyncio.Queue] = set()
        self._cameras_file = DATA_DIR / "cameras.json"
        self._alerts_file = DATA_DIR / "alerts.jsonl"

    async def start(self, model_path: Path) -> None:
        self.loop = asyncio.get_running_loop()
        self.model_path = model_path
        SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        self._load_alerts()
        for cam in self._load_cameras():
            self._spawn(cam)

    def shutdown(self) -> None:
        for w in self.workers.values():
            w.stop()

    def create_detector(self) -> Detector:
        return Detector(self.model_path)

    # --- cameras ---------------------------------------------------------------------

    def list(self) -> list[dict]:
        return [{**w.cam.model_dump(), **w.summary()} for w in self.workers.values()]

    def get(self, cam_id: str) -> CameraWorker | None:
        return self.workers.get(cam_id)

    def add(self, data: CameraIn) -> Camera:
        cam = Camera(id=uuid.uuid4().hex[:8], **data.model_dump())
        self._spawn(cam)
        self._save_cameras()
        return cam

    def update(self, cam_id: str, data: CameraIn) -> Camera:
        old = self.workers.pop(cam_id)
        old.stop()
        cam = Camera(id=cam_id, **data.model_dump())
        self._spawn(cam)
        self._save_cameras()
        self.discard_video(old.cam.url)
        return cam

    def remove(self, cam_id: str) -> None:
        worker = self.workers.pop(cam_id)
        worker.stop()
        self._save_cameras()
        self.discard_video(worker.cam.url)

    def discard_video(self, url: str) -> None:
        """Delete an uploaded demo video once no camera plays it any more."""
        path = Path(url)
        if path.parent != VIDEOS_DIR or any(w.cam.url == url for w in self.workers.values()):
            return
        path.unlink(missing_ok=True)

    def _spawn(self, cam: Camera) -> None:
        worker = CameraWorker(cam, self)
        self.workers[cam.id] = worker
        worker.start()

    def _load_cameras(self) -> list[Camera]:
        try:
            return [Camera.model_validate(c) for c in json.loads(self._cameras_file.read_text())]
        except FileNotFoundError:
            return []
        except ValueError:
            log.exception("cameras.json is invalid, starting with no cameras")
            return []

    def _save_cameras(self) -> None:
        self._cameras_file.parent.mkdir(parents=True, exist_ok=True)
        data = [w.cam.model_dump() for w in self.workers.values()]
        self._cameras_file.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    # --- alerts ----------------------------------------------------------------------

    def emit(self, event: dict) -> None:  # called from worker threads
        try:
            with self._alerts_file.open("a") as f:
                f.write(json.dumps(event, ensure_ascii=False) + "\n")
        except OSError:
            log.exception("cannot persist alert")
        try:
            self.loop.call_soon_threadsafe(self._fanout, event)
        except RuntimeError:  # loop closed during shutdown
            pass

    def _fanout(self, event: dict) -> None:
        self.alerts.appendleft(event)
        for q in self._subscribers:
            q.put_nowait(event)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def clear_alerts(self) -> None:
        self.alerts.clear()
        self._alerts_file.unlink(missing_ok=True)

    def _load_alerts(self) -> None:
        try:
            lines = self._alerts_file.read_text().splitlines()[-self.alerts.maxlen :]
        except FileNotFoundError:
            return
        for line in lines:
            try:
                self.alerts.appendleft(json.loads(line))
            except ValueError:
                continue


def _det_json(d: Detection) -> dict:
    out = {"c": d.category, "s": d.conf, "b": d.box, "st": d.state}
    if d.track_id is not None:
        out["id"] = d.track_id
    if d.age:
        out["age"] = d.age
    return out


_BGR = {"person": (240, 201, 76), "litter": (61, 138, 255), "pending": (71, 181, 255), "held": (160, 160, 160)}


def _annotate(img, dets: list[Detection]):
    """Evidence snapshot for alerts: boxes drawn server-side once, at alert time."""
    img = img.copy()
    h, w = img.shape[:2]
    for d in dets:
        x1, y1, x2, y2 = int(d.box[0] * w), int(d.box[1] * h), int(d.box[2] * w), int(d.box[3] * h)
        color = _BGR.get(d.state, _BGR["litter"])
        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)
        label = f"{CATEGORIES[d.category].label} {d.conf:.0%}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(img, (x1, max(0, y1 - th - 8)), (x1 + tw + 8, y1), color, -1)
        cv2.putText(img, label, (x1 + 4, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
    return img
