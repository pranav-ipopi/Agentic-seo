import asyncio
import logging
import sys
import os

# Ensure the backlink_automation directory is in the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from methods.stealth_browser import StealthBrowserManager
from services.captcha_service import CaptchaService
from executor.runner import TemplateRunner

async def main():
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("test_runner")

    browser_manager = StealthBrowserManager()
    await browser_manager.start()

    captcha_service = CaptchaService(logger=logger)
    runner = TemplateRunner()

    target_url = "https://www.corpfollow.com"
    client_site = "https://velaather.com"
    keyword = "Ather Electric Scooters"
    site_id = "wordpress_submitpro"

    logger.info(f"Testing {site_id} on {target_url}")

    try:
        result = await runner.execute(
            site_id=site_id,
            target_url=target_url,
            target_site_db_id=None,
            client_url=client_site,
            keyword=keyword,
            browser_manager=browser_manager,
            captcha_service=captcha_service,
            logger=logger
        )
        logger.info(f"Result: {result}")
    except Exception as e:
        logger.error(f"Test failed: {e}")
    finally:
        await browser_manager.close()

if __name__ == "__main__":
    asyncio.run(main())
