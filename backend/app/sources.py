"""Video sources.

* HTTP MJPEG (Android "IP Webcam", most IP cameras' /video endpoint): JPEG frames are
  cut out of the multipart stream and passed through untouched — no decode/re-encode
  for display, so the browser gets the camera's native frame rate for free.
* Everything else FFmpeg understands (RTSP/H.264 CCTV cameras, video files, USB
  webcams) goes through OpenCV's FFmpeg backend and is decoded to raw frames.
"""

from __future__ import annotations

import base64
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from collections.abc import Iterator

import cv2
import numpy as np

# FFmpeg defaults for RTSP cameras: TCP transport, low-delay decoding. (No "fflags;nobuffer":
# it makes the first read of local video files fail.)
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|flags;low_delay")

SOI, EOI = b"\xff\xd8", b"\xff\xd9"
_CONTENT_LENGTH = re.compile(rb"content-length:\s*(\d+)", re.IGNORECASE)
_BARE_HOST = re.compile(r"^[\w.-]+:\d+(/.*)?$|^\d{1,3}(\.\d{1,3}){3}(/.*)?$")
_SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
HTTP_TIMEOUT = 6.0


class Frame:
    """A video frame held as JPEG bytes, a BGR array, or both (converted lazily)."""

    __slots__ = ("jpeg", "image", "ts")

    def __init__(self, jpeg: bytes | None = None, image: np.ndarray | None = None):
        self.jpeg = jpeg
        self.image = image
        self.ts = time.time()

    def encode(self, quality: int = 80) -> bytes:
        if self.jpeg is None:
            ok, buf = cv2.imencode(".jpg", self.image, [cv2.IMWRITE_JPEG_QUALITY, quality])
            if not ok:
                raise ValueError("JPEG encoding failed")
            self.jpeg = buf.tobytes()
        return self.jpeg

    def decode(self, min_width: int | None = None) -> np.ndarray:
        """BGR image. With ``min_width`` large JPEGs are downscaled 2x/4x inside the
        decoder (DCT scaling), which is several times cheaper than decode + resize."""
        if self.image is not None:
            return self.image
        flag = cv2.IMREAD_COLOR
        size = jpeg_size(self.jpeg) if min_width else None
        if size:
            if size[0] >= 4 * min_width:
                flag = cv2.IMREAD_REDUCED_COLOR_4
            elif size[0] >= 2 * min_width:
                flag = cv2.IMREAD_REDUCED_COLOR_2
        img = cv2.imdecode(np.frombuffer(self.jpeg, np.uint8), flag)
        if img is None:
            raise ValueError("corrupt JPEG frame")
        return img

    def size(self) -> tuple[int, int] | None:
        if self.image is not None:
            return self.image.shape[1], self.image.shape[0]
        return jpeg_size(self.jpeg)


def jpeg_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) read from the JPEG SOF header without decoding."""
    i, n = 2, len(data)
    while i + 9 < n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker == 0xFF:
            i += 1
            continue
        if marker in (0x01, 0xD8) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker in _SOF_MARKERS:
            return int.from_bytes(data[i + 7 : i + 9], "big"), int.from_bytes(data[i + 5 : i + 7], "big")
        i += 2 + int.from_bytes(data[i + 2 : i + 4], "big")
    return None


def normalize_url(url: str) -> str:
    """Accept shorthand like ``192.168.1.20:8080`` and IP Webcam base URLs."""
    url = url.strip()
    if _BARE_HOST.match(url):
        url = "http://" + url
    parts = urllib.parse.urlsplit(url)
    if parts.scheme in ("http", "https") and parts.path in ("", "/"):
        # IP Webcam serves its MJPEG stream at /video
        url = urllib.parse.urlunsplit(parts._replace(path="/video"))
    return url


def open_source(url: str, stop: threading.Event) -> Iterator[Frame]:
    """Yield frames from ``url`` until ``stop`` is set. Raises on connection loss."""
    url = normalize_url(url)
    if url.isdigit():
        yield from _opencv_frames(int(url), stop)
        return
    if url.lower().startswith(("http://", "https://")):
        resp = _http_open(url)
        try:
            ctype = resp.headers.get_content_type()
            if ctype.startswith("multipart/"):
                yield from _mjpeg_frames(resp, stop)
                return
            if ctype == "image/jpeg":
                yield from _snapshot_frames(url, resp, stop)
                return
        finally:
            resp.close()
    # RTSP, RTMP, HLS, files, anything else → FFmpeg
    yield from _opencv_frames(url, stop)


def grab_one(url: str) -> Frame:
    """Read a single frame (used by the "test connection" button)."""
    stop = threading.Event()
    for frame in open_source(url, stop):
        stop.set()
        return frame
    raise ConnectionError("source returned no frames")


def _http_open(url: str):
    parts = urllib.parse.urlsplit(url)
    headers = {"User-Agent": "CamOn/1.0", "Accept": "*/*"}
    if parts.username:
        creds = f"{urllib.parse.unquote(parts.username)}:{urllib.parse.unquote(parts.password or '')}"
        headers["Authorization"] = "Basic " + base64.b64encode(creds.encode()).decode()
        netloc = parts.hostname + (f":{parts.port}" if parts.port else "")
        url = urllib.parse.urlunsplit(parts._replace(netloc=netloc))
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=HTTP_TIMEOUT)


def _mjpeg_frames(resp, stop: threading.Event) -> Iterator[Frame]:
    """Cut JPEGs out of a multipart/x-mixed-replace stream.

    Uses the part's Content-Length when present and falls back to SOI/EOI markers,
    so it works regardless of the boundary string a camera picks."""
    buf = bytearray()
    while not stop.is_set():
        chunk = resp.read1(1 << 16)
        if not chunk:
            raise ConnectionError("camera closed the stream")
        buf += chunk
        while True:
            soi = buf.find(SOI)
            if soi < 0:
                if len(buf) > 8 << 20:
                    buf.clear()
                break
            end = -1
            m = _CONTENT_LENGTH.search(buf, 0, soi)
            if m:
                candidate = soi + int(m.group(1))
                if len(buf) < candidate:
                    break
                if buf[candidate - 2 : candidate] == EOI:
                    end = candidate
            if end < 0:
                eoi = buf.find(EOI, soi + 2)
                if eoi < 0:
                    break
                end = eoi + 2
            jpeg = bytes(buf[soi:end])
            del buf[:end]
            yield Frame(jpeg=jpeg)


def _snapshot_frames(url: str, first_resp, stop: threading.Event) -> Iterator[Frame]:
    """Poll a single-JPEG endpoint (e.g. IP Webcam's /shot.jpg)."""
    yield Frame(jpeg=first_resp.read())
    while not stop.is_set():
        with _http_open(url) as resp:
            yield Frame(jpeg=resp.read())


def _opencv_frames(src: int | str, stop: threading.Event) -> Iterator[Frame]:
    params = [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 6000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 6000]
    backend = cv2.CAP_ANY if isinstance(src, int) else cv2.CAP_FFMPEG
    cap = cv2.VideoCapture(src, backend, params)
    if not cap.isOpened():
        raise ConnectionError(f"cannot open {src}")
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        is_file = isinstance(src, str) and os.path.isfile(src)
        fps = cap.get(cv2.CAP_PROP_FPS)
        period = 1.0 / (fps if 1 <= fps <= 120 else 30)
        next_t = time.monotonic()
        failures = 0
        while not stop.is_set():
            ok, img = cap.read()
            if not ok:
                failures += 1
                if is_file and failures < 3:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)  # loop demo videos
                    continue
                raise ConnectionError("video stream ended")
            failures = 0
            if is_file:  # play files at their native speed, like a live camera
                next_t += period
                delay = next_t - time.monotonic()
                if delay > 0:
                    time.sleep(delay)
                elif delay < -1:
                    next_t = time.monotonic()
            yield Frame(image=img)
    finally:
        cap.release()
