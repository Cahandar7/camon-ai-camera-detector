"""Static configuration (env vars / backend/.env) and runtime-tunable settings."""

from __future__ import annotations

import json
import threading
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = BACKEND_DIR / "data"
MODELS_DIR = BACKEND_DIR / "models"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
VIDEOS_DIR = DATA_DIR / "videos"  # demo videos uploaded from the UI


class Settings(BaseSettings):
    """Process-level settings. Override with CAMON_* env vars or backend/.env."""

    model_config = SettingsConfigDict(env_prefix="CAMON_", env_file=BACKEND_DIR / ".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000
    model: str = "yoloe-26s"  # yoloe-26n/s/m (litter vocabulary) or yolo26n/s/m (COCO)
    runtime: str = "openvino"  # openvino (fast on Intel CPUs) | torch
    int8: bool = True  # INT8 quantization for OpenVINO: ~1.5x faster, near-identical accuracy
    imgsz: int = 640
    max_ai_fps: float = 15.0  # per-camera inference cap; the UI interpolates boxes in between
    stream_quality: int = 80  # JPEG quality when re-encoding non-MJPEG sources (RTSP, webcam)

    # Password-reset emails. Without smtp_host the reset link is printed to the server log.
    public_url: str = ""  # address people open the dashboard at, e.g. https://camon.example.com
    smtp_host: str = ""  # smtp.gmail.com, smtp-relay.brevo.com, smtp.resend.com, …
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""  # defaults to smtp_user
    smtp_ssl: bool = False  # True for port 465 (implicit TLS); 587 uses STARTTLS
    frontend_dist: Path | None = None  # optional separately built UI directory


settings = Settings()
FRONTEND_DIST = (
    settings.frontend_dist.expanduser()
    if settings.frontend_dist
    else PROJECT_DIR / "frontend" / "dist"
)


class RuntimeSettings(BaseModel):
    """Settings the operator can change live from the UI."""

    confidence: float = Field(0.30, ge=0.05, le=0.95)
    alert_threshold: int = Field(60, ge=5, le=95)  # cleanliness % below which an alert fires
    dwell_alert_seconds: int = Field(30, ge=5, le=3600)  # litter lying longer than this → alert
    confirm_seconds: float = Field(1.0, ge=0.0, le=10.0)  # litter must persist this long to count


class RuntimeStore:
    def __init__(self, path: Path):
        self._path = path
        self._lock = threading.Lock()
        try:
            self.value = RuntimeSettings.model_validate_json(path.read_text())
        except (OSError, ValueError):
            self.value = RuntimeSettings()

    def update(self, patch: dict) -> RuntimeSettings:
        with self._lock:
            self.value = RuntimeSettings.model_validate({**self.value.model_dump(), **patch})
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(self.value.model_dump(), indent=2))
            return self.value
