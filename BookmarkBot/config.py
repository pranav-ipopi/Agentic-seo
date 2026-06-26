"""Central configuration for BookmarkBot.

This scaffold is intended for automation on sites/accounts you own or are
explicitly authorized to operate. It intentionally does not include anti-bot,
CAPTCHA, or access-control bypass logic.
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# --- Paths ---
DEFAULT_BASE_DIR = Path(os.getenv("BOOKMARKBOT_BASE_DIR", r"C:\BookmarkBot"))
PROFILE_BASE_DIR = Path(os.getenv("PROFILE_BASE_DIR", str(DEFAULT_BASE_DIR / "profiles")))
LOG_DIR = Path(os.getenv("LOG_DIR", str(DEFAULT_BASE_DIR / "logs")))

# --- Supabase ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
JOBS_TABLE = os.getenv("JOBS_TABLE", "jobs").strip()

# --- Worker Settings ---
# For 5000/day, the average successful completion target is ~208/hour.
# Start lower, verify stability, then raise workers based on CPU/RAM and site permission.
NUM_WORKERS = int(os.getenv("NUM_WORKERS", "10"))
JOBS_PER_BATCH = int(os.getenv("JOBS_PER_BATCH", "1000"))
JOBS_PER_DAY_TARGET = int(os.getenv("JOBS_PER_DAY_TARGET", "5000"))
JOB_COOLDOWN = float(os.getenv("JOB_COOLDOWN", "1.5"))
BROWSER_RESTART_EVERY = int(os.getenv("BROWSER_RESTART_EVERY", "150"))
POLL_SLEEP_SECONDS = int(os.getenv("POLL_SLEEP_SECONDS", "300"))
BATCH_SLEEP_SECONDS = int(os.getenv("BATCH_SLEEP_SECONDS", "1800"))

# --- Throughput / politeness controls ---
# Global limiter prevents 30 workers from stampeding at once. For 5000/day,
# one new job start every ~17.28s is the sustainable average.
GLOBAL_MIN_JOB_START_INTERVAL = float(
    os.getenv("GLOBAL_MIN_JOB_START_INTERVAL", str(86400 / max(1, JOBS_PER_DAY_TARGET)))
)
PER_HOST_MIN_JOB_START_INTERVAL = float(os.getenv("PER_HOST_MIN_JOB_START_INTERVAL", "30"))
START_JITTER_MAX_SECONDS = float(os.getenv("START_JITTER_MAX_SECONDS", "2.0"))

# --- Browser Settings ---
# Keep headful for workflows that require visible browser interaction.
HEADLESS = os.getenv("HEADLESS", "false").lower() in {"1", "true", "yes"}
CHROME_BINARY = os.getenv("CHROME_BINARY", "").strip() or None
PAGE_LOAD_TIMEOUT = int(os.getenv("PAGE_LOAD_TIMEOUT", "60"))
WINDOW_WIDTH = int(os.getenv("WINDOW_WIDTH", "1366"))
WINDOW_HEIGHT = int(os.getenv("WINDOW_HEIGHT", "768"))

# Optional enterprise/customer-approved outbound proxy routing.
# File format: one proxy per line, e.g. http://user:pass@host:port
PROXY_MODE = os.getenv("PROXY_MODE", "off")  # off | static_per_worker
PROXY_LIST_FILE = os.getenv("PROXY_LIST_FILE", "").strip()

# --- Job Settings ---
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT", "60"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))

# Optional allow-list. Comma-separated hostnames, e.g. "example.com,my-site.com".
# If set, jobs for other hosts are rejected for safety.
ALLOWED_HOSTS = [h.strip().lower() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]
