from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


@dataclass
class Metrics:
    started_at: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)
    jobs_started: int = 0
    jobs_succeeded: int = 0
    jobs_failed: int = 0
    retries: int = 0

    def inc(self, name: str, amount: int = 1) -> None:
        with self.lock:
            setattr(self, name, getattr(self, name) + amount)

    def snapshot(self) -> dict[str, float | int]:
        with self.lock:
            elapsed = max(1.0, time.time() - self.started_at)
            per_hour = self.jobs_succeeded / elapsed * 3600
            projected_per_day = per_hour * 24
            return {
                "jobs_started": self.jobs_started,
                "jobs_succeeded": self.jobs_succeeded,
                "jobs_failed": self.jobs_failed,
                "retries": self.retries,
                "elapsed_minutes": round(elapsed / 60, 1),
                "success_per_hour": round(per_hour, 1),
                "projected_success_per_day": round(projected_per_day, 0),
            }


metrics = Metrics()
