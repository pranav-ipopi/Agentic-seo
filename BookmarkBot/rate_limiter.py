from __future__ import annotations

import random
import threading
import time
from collections import defaultdict
from urllib.parse import urlparse

from config import (
    GLOBAL_MIN_JOB_START_INTERVAL,
    PER_HOST_MIN_JOB_START_INTERVAL,
    START_JITTER_MAX_SECONDS,
)


class RateLimiter:
    """Thread-safe start-rate limiter for production stability.

    This controls job *start* bursts across workers so 30 browsers do not all
    hit the same host at once. It is for polite, authorized automation and
    capacity management, not for bypassing site protections.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._next_global_at = 0.0
        self._next_host_at: dict[str, float] = defaultdict(float)

    @staticmethod
    def host_for_url(url: str) -> str:
        return (urlparse(url).hostname or "unknown").lower()

    def wait_for_turn(self, url: str) -> None:
        host = self.host_for_url(url)

        while True:
            with self._lock:
                now = time.time()
                allowed_at = max(self._next_global_at, self._next_host_at[host])
                wait_for = allowed_at - now

                if wait_for <= 0:
                    jitter = random.uniform(0, max(0.0, START_JITTER_MAX_SECONDS))
                    self._next_global_at = now + GLOBAL_MIN_JOB_START_INTERVAL + jitter
                    self._next_host_at[host] = now + PER_HOST_MIN_JOB_START_INTERVAL + jitter
                    return

            time.sleep(min(wait_for, 5.0))


rate_limiter = RateLimiter()
