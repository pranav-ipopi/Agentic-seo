import asyncio
import argparse
import logging
import sys

# Ensure services and templates are in path
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from methods.stealth_browser import StealthBrowserManager
from services.captcha_service import CaptchaService
from services.logging_service import setup_logger
from templates.livebookmarking import LiveBookmarkingTemplate

async def main():
    parser = argparse.ArgumentParser(description="Test Livebookmarking Automation")
    parser.add_argument("--client_site", type=str, default="https://example.com", help="The client site URL")
    parser.add_argument("--keyword", type=str, default="test keyword", help="The keyword for the backlink")
    args = parser.parse_args()

    logger = setup_logger(level=logging.INFO)
    logger.info(f"Testing LiveBookmarkingTemplate with client_site={args.client_site}, keyword={args.keyword}")

    browser_manager = StealthBrowserManager()
    await browser_manager.start()
    
    captcha_service = CaptchaService(logger=logger)

    template = LiveBookmarkingTemplate(
        browser_manager=browser_manager,
        captcha_service=captcha_service,
        logger=logger
    )

    try:
        result = await template.run(args.client_site, args.keyword)
        logger.info(f"Success! Result: {result}")
    except Exception as e:
        logger.error(f"Failed: {e}", exc_info=True)
    finally:
        await browser_manager.close()

if __name__ == "__main__":
    asyncio.run(main())
