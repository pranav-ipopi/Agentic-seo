from __future__ import annotations

from pathlib import Path

from config import PROXY_LIST_FILE, PROXY_MODE
from logger_setup import get_logger

logger = get_logger("PROXY")


class ProxyManager:
    """Optional outbound proxy assignment.

    Use this only for legitimate network routing, geo-testing, or customer-
    approved environments. This manager intentionally assigns proxies
    deterministically per worker to keep sessions consistent.
    """

    def __init__(self) -> None:
        self.proxies = self._load_proxies()
        if self.proxies:
            logger.info("Loaded %s configured proxies", len(self.proxies))
        else:
            logger.info("No proxy list configured; browsers will connect directly")

    def _load_proxies(self) -> list[str]:
        if not PROXY_LIST_FILE:
            return []
        path = Path(PROXY_LIST_FILE)
        if not path.exists():
            logger.warning("PROXY_LIST_FILE does not exist: %s", path)
            return []
        proxies: list[str] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            proxies.append(line)
        return proxies

    def get_proxy_for_worker(self, worker_id: int) -> str | None:
        if not self.proxies or PROXY_MODE.lower() == "off":
            return None
        # Stable assignment: worker_0 always uses proxies[0 % n], etc.
        return self.proxies[worker_id % len(self.proxies)]


proxy_manager = ProxyManager()
