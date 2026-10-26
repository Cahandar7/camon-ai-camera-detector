"""Object detection: model preparation, class → category mapping and tracking.

Default model is YOLOE-26s — a YOLO26 detector that takes its class list as plain
text. We give it a litter vocabulary ("soda can", "plastic bag", ...) once, bake the
text embeddings into the weights, drop the segmentation head (we only need boxes)
and quantize to INT8 for OpenVINO. Result: a closed-set litter detector, no training
data required, ~40 ms per frame on a laptop CPU. A new litter type = one line in
VOCABULARY. Plain COCO models (CAMON_MODEL=yolo26s) are supported too.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import platform
import threading
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .config import MODELS_DIR, settings

log = logging.getLogger("camon")

TRACKER_CFG = Path(__file__).with_name("tracker.yaml")
CALIBRATION_URL = "https://github.com/ultralytics/assets/releases/download/v0.0.0/coco128.zip"


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    kind: str  # "person" | "litter"
    weight: float  # contribution to the pollution index (see analytics.py)


CATEGORIES: dict[str, Category] = {
    c.key: c
    for c in (
        Category("person", "Person", "person", 0.0),
        Category("bottle", "Bottle", "litter", 1.0),
        Category("cup", "Cup", "litter", 0.8),
        Category("can", "Can", "litter", 0.8),
        Category("bag", "Plastic bag", "litter", 1.3),
        Category("paper", "Paper", "litter", 0.6),
        Category("food", "Food waste", "litter", 0.7),
    )
}

# YOLOE text prompts → category. One prompt per category: the model is NMS-free, so
# two prompts for the same thing would produce duplicate boxes.
VOCABULARY = {
    "person": "person",
    "bottle": "bottle",
    "cup": "cup",
    "soda can": "can",  # plain "can" also fires on trash bins
    "plastic bag": "bag",
    "paper": "paper",
}

# Class names of closed-set models (COCO yolo26*, Objects365 yolo26*-objv1) → category
CLASS_MAP = {
    **VOCABULARY,
    "wine glass": "cup",
    "canned": "can",
    "tissue": "paper",
    "paper towel": "paper",
    "notepaper": "paper",
    **dict.fromkeys(("banana", "apple", "orange", "sandwich", "hot dog", "pizza", "donut", "cake"), "food"),
}


@dataclass(slots=True)
class Detection:
    box: tuple[float, float, float, float]  # normalized x1, y1, x2, y2
    category: str
    conf: float
    track_id: int | None
    state: str = ""  # person | litter | pending | held — set by analytics
    age: float = 0.0  # seconds a litter item has been lying there


MODEL_INFO: dict = {}
_load_lock = threading.Lock()


class Detector:
    """One per camera: the tracker keeps per-stream state inside the model object."""

    def __init__(self, weights: Path):
        from ultralytics import YOLO

        with _load_lock:
            self.model = YOLO(str(weights), task="detect")
            names = self.model.names
        self.category_of = {i: CLASS_MAP[n] for i, n in names.items() if n in CLASS_MAP}
        self.classes = sorted(self.category_of)
        self.model.predict(np.zeros((360, 640, 3), np.uint8), imgsz=settings.imgsz, verbose=False)  # warm-up

    def __call__(self, image: np.ndarray, conf: float) -> list[Detection]:
        result = self.model.track(
            image,
            persist=True,
            tracker=str(TRACKER_CFG),
            imgsz=settings.imgsz,
            conf=conf,
            classes=self.classes,
            verbose=False,
        )[0]
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            return []
        ids = boxes.id.int().tolist() if boxes.id is not None else [None] * len(boxes)
        return [
            Detection(tuple(round(v, 4) for v in box), self.category_of[c], round(s, 3), tid)
            for box, c, s, tid in zip(boxes.xyxyn.tolist(), boxes.cls.int().tolist(), boxes.conf.tolist(), ids)
            if c in self.category_of
        ]


# --- model preparation (runs once at startup, cached in backend/models) --------------


def prepare_model() -> Path:
    """Download and build the configured model; returns the path to load."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    name = settings.model
    with _cwd(MODELS_DIR):  # Ultralytics drops helper downloads (text encoder) into cwd
        pt = _build_yoloe(name) if name.startswith("yoloe") else _download(f"{name}.pt")
        path, runtime = pt, "PyTorch"
        if settings.runtime == "openvino":
            path, runtime = _export_openvino(pt)

    from ultralytics import YOLO

    names = YOLO(str(path), task="detect").names
    active = sorted({CLASS_MAP[n] for n in names.values() if n in CLASS_MAP}, key=list(CATEGORIES).index)
    MODEL_INFO.update(
        model=_display_name(name),
        runtime=runtime,
        device=_cpu_name(),
        imgsz=settings.imgsz,
        categories=[{"key": k, "label": CATEGORIES[k].label, "kind": CATEGORIES[k].kind} for k in active],
    )
    log.info("Model ready: %s · %s · %s", MODEL_INFO["model"], runtime, ", ".join(active))
    return path


def model_info() -> dict:
    return MODEL_INFO


def _download(filename: str) -> Path:
    from ultralytics.utils.downloads import attempt_download_asset

    path = MODELS_DIR / filename
    if not path.exists():
        log.info("Downloading %s ...", filename)
        attempt_download_asset(path)
    return path


def _build_yoloe(name: str) -> Path:
    """YOLOE + our vocabulary → detection-only weights with the classes baked in."""
    digest = hashlib.sha1("|".join(VOCABULARY).encode()).hexdigest()[:6]
    out = MODELS_DIR / f"{name}-camon-{digest}.pt"
    if out.exists():
        return out
    from ultralytics import YOLOE

    seg_weights = _download(f"{name}-seg.pt")
    log.info("Building %s with litter vocabulary: %s", out.name, ", ".join(VOCABULARY))
    model = YOLOE(f"{name}.yaml").load(str(seg_weights))  # detection head only, no masks
    prompts = list(VOCABULARY)
    model.set_classes(prompts, model.get_text_pe(prompts))
    model.save(str(out))
    return out


def _export_openvino(pt: Path) -> tuple[Path, str]:
    from ultralytics import YOLO

    int8_dir = pt.with_name(f"{pt.stem}_int8_openvino_model")
    fp32_dir = pt.with_name(f"{pt.stem}_openvino_model")
    if settings.int8:
        if not any(int8_dir.glob("*.xml")):
            try:
                log.info("Quantizing %s to INT8 for OpenVINO (one-time, ~1-2 min) ...", pt.name)
                YOLO(str(pt)).export(
                    format="openvino", imgsz=settings.imgsz, dynamic=True, int8=True, data=str(_calibration_yaml())
                )
            except Exception:
                log.exception("INT8 export failed, falling back to FP32")
        if any(int8_dir.glob("*.xml")):
            return int8_dir, "OpenVINO INT8"
    if not any(fp32_dir.glob("*.xml")):
        try:
            log.info("Exporting %s to OpenVINO (one-time) ...", pt.name)
            YOLO(str(pt)).export(format="openvino", imgsz=settings.imgsz, dynamic=True)
        except Exception:
            log.exception("OpenVINO export failed, using PyTorch")
            return pt, "PyTorch"
    return fp32_dir, "OpenVINO"


def _calibration_yaml() -> Path:
    """COCO128 images for INT8 calibration, stored inside the project (not in
    Ultralytics' global datasets dir)."""
    import ultralytics
    from ultralytics.utils import YAML
    from ultralytics.utils.downloads import safe_download

    root = MODELS_DIR / "calibration"
    images = root / "coco128" / "images" / "train2017"
    if not images.is_dir():
        safe_download(CALIBRATION_URL, dir=root, unzip=True, delete=True)
    data = YAML.load(Path(ultralytics.__file__).parent / "cfg" / "datasets" / "coco128.yaml")
    data.pop("download", None)
    data.update(path=str(root / "coco128"), train="images/train2017", val="images/train2017")
    yaml_path = root / "coco128.yaml"
    YAML.save(yaml_path, data)
    return yaml_path


def _display_name(name: str) -> str:
    return f"YOLOE{name[5:]}" if name.startswith("yoloe") else f"YOLO{name[4:]}"


def _cpu_name() -> str:
    try:
        for line in Path("/proc/cpuinfo").read_text().splitlines():
            if line.startswith("model name"):
                return line.split(":", 1)[1].replace("(R)", "").replace("(TM)", "").replace(" CPU", "").strip()
    except OSError:
        pass
    return platform.processor() or "CPU"


@contextlib.contextmanager
def _cwd(path: Path):
    old = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(old)
