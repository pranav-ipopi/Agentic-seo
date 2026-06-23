"""
Debug script: Run PliggGenericTemplate against failing sites to reproduce and diagnose errors.

Sites to test:
  1. https://thefairlist.com        → ERR_INVALID_AUTH_CREDENTIALS
  2. https://bookmarkstumble.com    → ERR_INVALID_AUTH_CREDENTIALS
  3. https://letusbookmark.com      → TIMEOUT waiting for #reg_username
  4. https://sparxsocial.com        → False-positive registration, then TIMEOUT on URL submit field

Usage:
    cd playwright_automation/backlink_automation
    python debug_sites.py
"""

import asyncio
import logging
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from methods.stealth_browser import StealthBrowserManager
from executor.runner import TemplateRunner
from services.captcha_service import CaptchaService
from services.logging_service import setup_logger

# ── Test configuration ──────────────────────────────────────────────────────
CLIENT_SITE = "https://google.com"
KEYWORD = "best search engine"

SITES = [
    # (label, url, site_id)
    ("thefairlist",      "https://thefairlist.com/",      "pligg"),
    ("bookmarkstumble",  "https://bookmarkstumble.com/",  "pligg"),
    ("letusbookmark",    "https://letusbookmark.com/",    "pligg"),
    ("sparxsocial",      "https://sparxsocial.com/",      "pligg"),
]

# Set to None to run all, or e.g. ["sparxsocial"] to test only one
RUN_ONLY = ["letusbookmark", "sparxsocial"]
# ────────────────────────────────────────────────────────────────────────────


async def run_site(label: str, url: str, site_id: str,
                   browser_manager: StealthBrowserManager,
                   runner: TemplateRunner,
                   captcha_service: CaptchaService,
                   logger: logging.Logger):
    """Run one site test and print result / exception."""
    if RUN_ONLY and label not in RUN_ONLY:
        logger.info(f"[{label}] SKIPPED (not in RUN_ONLY)")
        return

    logger.info(f"\n{'='*60}")
    logger.info(f"[{label}] Starting test → {url}")
    logger.info(f"{'='*60}")

    page = None
    try:
        page = await browser_manager.get_page()

        result = await runner.execute(
            site_id=site_id,
            target_url=url,
            target_site_db_id=None,   # no DB override needed for debug
            client_url=CLIENT_SITE,
            keyword=KEYWORD,
            page=page,
            captcha_service=captcha_service,
            logger=logger,
        )

        logger.info(f"[{label}] ✅ SUCCESS → backlink: {result.get('backlink_url')}")

    except Exception as e:
        logger.error(f"[{label}] ❌ FAILED: {type(e).__name__}: {e}")
        logger.error(traceback.format_exc())

        # Capture a screenshot so we can see exactly where it died
        if page and not page.is_closed():
            try:
                screenshot_path = f"debug_{label}_failure.png"
                await page.screenshot(path=screenshot_path, full_page=False)
                logger.info(f"[{label}] Screenshot saved: {screenshot_path}")
                logger.info(f"[{label}] Final URL at failure: {page.url}")

                # Dump page title and first 500 chars of body text for context
                try:
                    title = await page.title()
                    body = (await page.inner_text("body"))[:800]
                    logger.info(f"[{label}] Page title: {title!r}")
                    logger.info(f"[{label}] Body excerpt:\n{body}")
                except Exception:
                    pass
            except Exception as ss_err:
                logger.warning(f"[{label}] Could not save screenshot: {ss_err}")
    finally:
        if page and not page.is_closed():
            try:
                await page.context.close()
            except Exception:
                pass


async def main():
    logger = setup_logger(level=logging.INFO)
    logger.info("Debug run starting...")

    browser_manager = StealthBrowserManager()
    runner = TemplateRunner()
    captcha_service = CaptchaService(logger=logger)

    await browser_manager.start()

    try:
        for label, url, site_id in SITES:
            await run_site(label, url, site_id, browser_manager, runner, captcha_service, logger)
            # Short pause between sites to avoid fingerprinting
            await asyncio.sleep(3)
    finally:
        await browser_manager.close()
        logger.info("Debug run complete.")


if __name__ == "__main__":
    asyncio.run(main())
