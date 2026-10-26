"""Turns raw detections into zone-level insight: cleanliness index, litter dwell
times, visitor counts and alerts.

YOLO itself only says *what* is in the frame. Whether a zone is "clean" is decided
here, from tracked detections over time:

* a litter item only counts once it has been seen for ``confirm_seconds`` — a single
  false-positive frame never moves the score;
* an item whose centre sits inside a person's box (upper body) is treated as
  carried, not littered — a person walking with a bottle is not pollution;
* pollution index P = Σ weight(category) over confirmed items, and
  cleanliness = 100 · e^(−P / K): one bottle ≈ 85 %, three ≈ 61 %, six ≈ 38 %;
* the score is smoothed (EMA) so the gauge moves calmly instead of flickering.
"""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass, field

from .config import RuntimeSettings
from .detector import CATEGORIES, Detection

K_POLLUTION = 6.0
SMOOTHING_TAU = 1.5  # seconds
FORGET_SECONDS = 3.0  # litter unseen this long is considered gone (picked up)
HISTORY_STEP = 2.0  # seconds between history points
HISTORY_LEN = 600  # 20 minutes
ALERT_HOLD = 3.0  # score must stay below threshold this long before alerting
RESOLVE_MARGIN = 5.0

LEVELS = ((80, "clean"), (60, "moderate"), (40, "dirty"), (0, "critical"))


def level_for(score: float) -> str:
    return next(name for floor, name in LEVELS if score >= floor)


@dataclass
class LitterItem:
    category: str
    first_seen: float
    last_seen: float
    confirmed: bool = False
    dwell_alerted: bool = False


@dataclass
class ZoneAnalytics:
    items: dict[int, LitterItem] = field(default_factory=dict)
    score: float = 100.0
    raw_score: float = 100.0
    visitors: set[int] = field(default_factory=set)
    litter_seen: int = 0
    history: deque = field(default_factory=lambda: deque(maxlen=HISTORY_LEN))
    in_alert: bool = False
    alert_level: str = ""
    alert_started: float = 0.0
    _below_since: float | None = None
    _above_since: float | None = None
    _last_ts: float | None = None
    _last_history: float = 0.0

    def update(self, dets: list[Detection], cfg: RuntimeSettings, now: float | None = None):
        """Returns (stats, history_point | None, events)."""
        now = now or time.time()
        persons = [d for d in dets if d.category == "person"]
        events: list[dict] = []

        for p in persons:
            p.state = "person"
            if p.track_id is not None:
                self.visitors.add(p.track_id)

        for d in dets:
            if d.category == "person":
                continue
            if any(_is_carried(d.box, p.box) for p in persons):
                d.state = "held"
                continue
            if d.track_id is None:
                d.state = "litter"
                continue
            item = self.items.get(d.track_id)
            if item is None:
                item = self.items[d.track_id] = LitterItem(d.category, now, now)
            item.last_seen = now
            item.category = d.category
            if not item.confirmed and now - item.first_seen >= cfg.confirm_seconds:
                item.confirmed = True
                self.litter_seen += 1
            d.state = "litter" if item.confirmed else "pending"
            d.age = round(now - item.first_seen, 1)

        for tid in [t for t, it in self.items.items() if now - it.last_seen > FORGET_SECONDS]:
            del self.items[tid]

        confirmed = [it for it in self.items.values() if it.confirmed]
        untracked = [d for d in dets if d.state == "litter" and d.track_id is None]
        pollution = sum(CATEGORIES[it.category].weight for it in confirmed)
        pollution += sum(CATEGORIES[d.category].weight for d in untracked)
        self.raw_score = 100.0 * math.exp(-pollution / K_POLLUTION)

        dt = 0.0 if self._last_ts is None else max(0.0, now - self._last_ts)
        self._last_ts = now
        alpha = 1.0 - math.exp(-dt / SMOOTHING_TAU) if dt else 1.0
        self.score += (self.raw_score - self.score) * alpha

        by_class: dict[str, int] = {}
        for it in confirmed:
            by_class[it.category] = by_class.get(it.category, 0) + 1
        for d in untracked:
            by_class[d.category] = by_class.get(d.category, 0) + 1

        events += self._dwell_events(confirmed, cfg, now)
        events += self._threshold_events(cfg, now)

        stats = {
            "score": round(self.score, 1),
            "level": level_for(self.score),
            "people": len(persons),
            "litter": len(confirmed) + len(untracked),
            "pending": sum(1 for d in dets if d.state == "pending"),
            "held": sum(1 for d in dets if d.state == "held"),
            "by_class": by_class,
            "visitors": len(self.visitors),
            "litter_seen": self.litter_seen,
            "oldest_litter": round(max((now - it.first_seen for it in confirmed), default=0.0), 1),
            "alert": self.alert_level if self.in_alert else "",
            # Confirmed items from the tracker registry — stable even when a detection
            # drops out for a few frames, unlike the per-frame detection list
            "items": [
                {"id": tid, "c": it.category, "age": round(now - it.first_seen, 1)}
                for tid, it in sorted(self.items.items(), key=lambda kv: kv[1].first_seen)
                if it.confirmed
            ][:20],
        }

        point = None
        if now - self._last_history >= HISTORY_STEP:
            self._last_history = now
            point = [round(now, 1), stats["score"], stats["people"], stats["litter"]]
            self.history.append(point)
        return stats, point, events

    def _dwell_events(self, confirmed: list[LitterItem], cfg: RuntimeSettings, now: float) -> list[dict]:
        events = []
        for it in confirmed:
            age = now - it.first_seen
            if not it.dwell_alerted and age >= cfg.dwell_alert_seconds:
                it.dwell_alerted = True
                label = CATEGORIES[it.category].label
                events.append({
                    "type": "dwell",
                    "severity": "warning",
                    "title": "Litter not removed",
                    "message": f"{label} has been lying here for {_fmt_duration(age)}",
                    "params": {"category": it.category, "seconds": round(age)},
                })
        return events

    def _threshold_events(self, cfg: RuntimeSettings, now: float) -> list[dict]:
        events = []
        threshold = cfg.alert_threshold
        if self.score < threshold:
            self._above_since = None
            self._below_since = self._below_since or now
            level = "critical" if self.score < min(40, threshold) else "warning"
            held_long_enough = now - self._below_since >= ALERT_HOLD
            escalated = self.in_alert and level == "critical" and self.alert_level != "critical"
            if held_long_enough and (not self.in_alert or escalated):
                if not self.in_alert:
                    self.alert_started = now
                self.in_alert, self.alert_level = True, level
                events.append({
                    "type": "pollution",
                    "severity": level,
                    "title": "Critical pollution level" if level == "critical" else "Zone is getting dirty",
                    "message": f"Cleanliness dropped to {self.score:.0f}% (threshold {threshold}%)",
                    "params": {"threshold": threshold},
                })
        elif self.score >= threshold + RESOLVE_MARGIN or self.score >= 99:
            self._below_since = None
            self._above_since = self._above_since or now
            if self.in_alert and now - self._above_since >= ALERT_HOLD:
                self.in_alert, self.alert_level = False, ""
                events.append({
                    "type": "resolved",
                    "severity": "info",
                    "title": "Zone is clean again",
                    "message": f"Cleaned up in {_fmt_duration(now - self.alert_started)} · {self.score:.0f}%",
                    "params": {"seconds": round(now - self.alert_started)},
                })
        else:  # hysteresis band: keep the current state, restart both timers
            self._below_since = self._above_since = None
        for e in events:
            e["score"] = round(self.score, 1)
        return events


def _is_carried(item: tuple, person: tuple) -> bool:
    """Litter whose centre is inside a person's box, above their feet, is being held."""
    cx, cy = (item[0] + item[2]) / 2, (item[1] + item[3]) / 2
    px1, py1, px2, py2 = person
    return px1 <= cx <= px2 and py1 <= cy <= py1 + 0.85 * (py2 - py1)


def _fmt_duration(seconds: float) -> str:
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s // 60}m {s % 60:02d}s"
    return f"{s // 3600}h {s % 3600 // 60:02d}m"
