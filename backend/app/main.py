"""CamOn API — REST for cameras/settings/alerts, MJPEG video streams, WebSockets
for detections and live alerts. Serves the built frontend when it exists."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import socket
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
from starlette.concurrency import run_in_threadpool

from .auth import AuthGate, users
from .auth import router as auth_router
from .cameras import CameraIn, CameraManager, CameraWorker
from .config import FRONTEND_DIST, SNAPSHOTS_DIR, VIDEOS_DIR, settings
from .detector import model_info, prepare_model
from .sources import Frame, grab_one, normalize_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("camon")

manager = CameraManager()
BOUNDARY = "camonframe"


@asynccontextmanager
async def lifespan(_: FastAPI):
    users.seed_admin()
    model_path = await asyncio.to_thread(prepare_model)
    await manager.start(model_path)
    log.info("CamOn is up — model %s, %d camera(s)", model_path.name, len(manager.workers))
    log.info("Dashboard: http://localhost:%d  ·  LAN: http://%s:%d", settings.port, _lan_ip(), settings.port)
    yield
    manager.shutdown()


app = FastAPI(title="CamOn API", version="0.1.0", lifespan=lifespan)
app.add_middleware(AuthGate, store=users)
app.include_router(auth_router)


def _worker(cam_id: str) -> CameraWorker:
    worker = manager.get(cam_id)
    if worker is None:
        raise HTTPException(404, "Camera not found")
    return worker


# --- system --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok", "time": time.time(), **model_info(), "cameras": len(manager.workers)}


class SettingsPatch(BaseModel):
    confidence: float | None = None
    alert_threshold: int | None = None
    dwell_alert_seconds: int | None = None
    confirm_seconds: float | None = None


@app.get("/api/settings")
def get_settings():
    return manager.runtime.value


@app.put("/api/settings")
def put_settings(patch: SettingsPatch):
    try:
        return manager.runtime.update(patch.model_dump(exclude_none=True))
    except ValidationError as exc:
        raise HTTPException(422, str(exc)) from exc


# --- cameras -------------------------------------------------------------------------


@app.get("/api/cameras")
def list_cameras():
    return manager.list()


@app.post("/api/cameras", status_code=201)
def add_camera(body: CameraIn):
    return manager.add(body)


@app.put("/api/cameras/{cam_id}")
def update_camera(cam_id: str, body: CameraIn):
    _worker(cam_id)
    return manager.update(cam_id, body)


@app.delete("/api/cameras/{cam_id}", status_code=204)
def delete_camera(cam_id: str):
    _worker(cam_id)
    manager.remove(cam_id)


class TestIn(BaseModel):
    url: str


@app.post("/api/cameras/test")
async def test_camera(body: TestIn):
    """Grab one frame so the user knows the URL works before saving the camera."""
    url = normalize_url(body.url)
    try:
        frame = await asyncio.wait_for(asyncio.to_thread(grab_one, body.url), timeout=12)
        img = frame.decode()
    except Exception as exc:
        return {"ok": False, "url": url, "error": str(exc) or exc.__class__.__name__}
    h, w = img.shape[:2]
    preview = cv2.resize(img, (480, round(h * 480 / w)), interpolation=cv2.INTER_AREA)
    jpeg = cv2.imencode(".jpg", preview, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes()
    return {
        "ok": True,
        "url": url,
        "width": w,
        "height": h,
        "preview": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode(),
    }


VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
MAX_VIDEO_BYTES = 2 << 30  # 2 GB


@app.post("/api/videos", status_code=201)
async def upload_video(request: Request, name: str = Query(min_length=1, max_length=200)):
    """Store a demo video sent as the raw request body (no multipart parsing, so any
    size streams straight to disk). The returned path is used as the camera URL."""
    ext = Path(name).suffix.lower()
    if ext not in VIDEO_EXTENSIONS:
        raise HTTPException(415, f"Unsupported video format: {ext or name}")
    stem = re.sub(r"[^\w.-]+", "_", Path(name).stem)[:60] or "video"
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    path = VIDEOS_DIR / f"{uuid.uuid4().hex[:8]}_{stem}{ext}"
    size = 0
    try:
        with path.open("wb") as f:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_VIDEO_BYTES:
                    raise HTTPException(413, "Video is larger than 2 GB")
                f.write(chunk)
        info = await asyncio.to_thread(_probe_video, path)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    if info is None:
        path.unlink(missing_ok=True)
        raise HTTPException(422, "This file can't be read as a video")
    return {"path": str(path), "name": name, "size": size, **info}


class VideoRef(BaseModel):
    path: str


@app.post("/api/videos/discard", status_code=204)
def discard_video(body: VideoRef):
    """Delete an uploaded video that no camera uses (e.g. the add-camera dialog was cancelled)."""
    manager.discard_video(body.path)


def _probe_video(path: Path) -> dict | None:
    cap = cv2.VideoCapture(str(path), cv2.CAP_FFMPEG)
    try:
        ok, img = cap.read()
        if not ok:
            return None
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        return {
            "width": img.shape[1],
            "height": img.shape[0],
            "duration": round(frames / fps, 1) if fps > 0 and frames > 0 else None,
        }
    finally:
        cap.release()


@app.get("/api/cameras/{cam_id}/snapshot")
async def snapshot(cam_id: str, w: int | None = Query(None, ge=64, le=3840)):
    frame = _worker(cam_id).latest
    if frame is None:
        raise HTTPException(503, "No frame yet")
    data = await run_in_threadpool(_snapshot_jpeg, frame, w)
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def _snapshot_jpeg(frame: Frame, width: int | None) -> bytes:
    if not width:
        return frame.encode(settings.stream_quality)
    img = frame.decode(min_width=width)
    if img.shape[1] > width:
        size = (width, round(img.shape[0] * width / img.shape[1]))
        img = cv2.resize(img, size, interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes()


@app.get("/api/cameras/{cam_id}/stream")
async def stream(cam_id: str):
    """Raw camera video as MJPEG — the browser decodes it natively in an <img>."""
    worker = _worker(cam_id)

    async def parts():
        worker.viewers += 1
        try:
            version = 0
            if worker.latest is not None:
                yield await _part(worker.latest)
            while manager.get(cam_id) is worker:
                try:
                    version, frame = await worker.frames.next(version, timeout=5)
                except TimeoutError:
                    continue
                yield await _part(frame)
        finally:
            worker.viewers -= 1

    return StreamingResponse(
        parts(),
        media_type=f"multipart/x-mixed-replace; boundary={BOUNDARY}",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )


async def _part(frame: Frame) -> bytes:
    jpeg = frame.jpeg or await run_in_threadpool(frame.encode, settings.stream_quality)
    head = f"--{BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: {len(jpeg)}\r\n\r\n".encode()
    return head + jpeg + b"\r\n"


# --- alerts --------------------------------------------------------------------------


@app.get("/api/alerts")
def list_alerts(limit: int = Query(100, ge=1, le=200)):
    return list(manager.alerts)[:limit]


@app.delete("/api/alerts", status_code=204)
def clear_alerts():
    manager.clear_alerts()


# --- websockets ----------------------------------------------------------------------


@app.websocket("/api/ws/cameras/{cam_id}")
async def ws_camera(ws: WebSocket, cam_id: str):
    """Detections + stats for one camera, pushed at the AI frame rate."""
    await ws.accept()
    worker = manager.get(cam_id)
    if worker is None:
        await ws.close(code=4404)
        return
    try:
        await ws.send_json({
            "type": "init",
            "summary": worker.summary(),
            "history": list(worker.analytics.history),
        })
        version = worker.results.version
        if worker.results.value is not None:
            await ws.send_json(worker.results.value)
        while manager.get(cam_id) is worker:
            try:
                version, result = await worker.results.next(version, timeout=2)
                await ws.send_json(result)
            except TimeoutError:
                await ws.send_json({"type": "status", "summary": worker.summary()})
    except (WebSocketDisconnect, RuntimeError):
        pass


@app.websocket("/api/ws/events")
async def ws_events(ws: WebSocket):
    """Camera summaries once a second + alerts the moment they happen."""
    await ws.accept()
    queue = manager.subscribe()
    try:
        last = 0.0
        while True:
            wait = max(0.0, 1.0 - (time.monotonic() - last))
            try:
                event = await asyncio.wait_for(queue.get(), timeout=wait)
                await ws.send_json({"type": "alert", "alert": event})
            except TimeoutError:
                pass
            if time.monotonic() - last >= 1.0:
                last = time.monotonic()
                await ws.send_json({"type": "cameras", "cameras": [w.summary() for w in manager.workers.values()]})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        manager.unsubscribe(queue)


# --- static --------------------------------------------------------------------------

app.mount("/api/snapshots", StaticFiles(directory=SNAPSHOTS_DIR, check_dir=False), name="snapshots")
if FRONTEND_DIST is not None and FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


def _lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
