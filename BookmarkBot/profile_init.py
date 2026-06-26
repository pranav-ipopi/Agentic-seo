"""Optional one-time profile initializer.

Use this only for authorized sites/accounts, for example to manually sign in to
profiles before running the service. It opens each profile and waits for you to
press Enter before moving to the next one.
"""
from __future__ import annotations

import os
import time

from seleniumbase import Driver

from config import HEADLESS, NUM_WORKERS, PROFILE_BASE_DIR

START_URL = os.getenv("PROFILE_INIT_URL", "https://example.com")


def init_profile(worker_id: int) -> None:
    profile_path = PROFILE_BASE_DIR / f"worker_{worker_id}"
    os.makedirs(profile_path, exist_ok=True)

    print(f"Opening profile {worker_id}: {profile_path}")
    driver = Driver(browser="chrome", headless=HEADLESS, user_data_dir=str(profile_path))
    try:
        driver.open(START_URL)
        input("Complete any authorized setup in the browser, then press Enter...")
    finally:
        driver.quit()
        time.sleep(1)


if __name__ == "__main__":
    for i in range(NUM_WORKERS):
        init_profile(i)
    print("All profiles initialized.")
