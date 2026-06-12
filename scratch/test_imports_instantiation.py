import asyncio
import logging
import sys
import os

# Add relevant paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "playwright_automation", "backlink_automation")))

from templates.pligg_generic import PliggGenericTemplate
from templates.wordpress_submitpro_generic import WordPressSubmitProTemplate
from methods.stealth_browser import StealthBrowserManager
from services.captcha_service import CaptchaService

async def main():
    logger = logging.getLogger("test")
    logging.basicConfig(level=logging.INFO)
    
    browser_manager = StealthBrowserManager()
    captcha_service = CaptchaService(logger=logger)
    
    print("Testing PliggGenericTemplate instantiation...")
    pligg = PliggGenericTemplate(
        target_url="https://livebookmarking.com/",
        browser_manager=browser_manager,
        captcha_service=captcha_service,
        logger=logger
    )
    assert pligg.BASE_URL == "https://livebookmarking.com"
    print("PliggGenericTemplate verified!")
    
    print("Testing WordPressSubmitProTemplate instantiation for bookmarks2u...")
    wp_b2u = WordPressSubmitProTemplate(
        target_url="https://www.bookmarks2u.com/",
        browser_manager=browser_manager,
        captcha_service=captcha_service,
        logger=logger
    )
    assert wp_b2u.BASE_URL == "https://www.bookmarks2u.com"
    assert wp_b2u.sitekey == "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId"
    print("WordPressSubmitProTemplate (bookmarks2u) verified!")

    print("Testing WordPressSubmitProTemplate instantiation for ukbookmarks...")
    wp_uk = WordPressSubmitProTemplate(
        target_url="https://www.ukbookmarks.com/",
        browser_manager=browser_manager,
        captcha_service=captcha_service,
        logger=logger
    )
    assert wp_uk.BASE_URL == "https://www.ukbookmarks.com"
    assert wp_uk.sitekey == "6LdsLkYUAAAAANTUsS-k_S47l1bSpqHPRG-U0XiI"
    print("WordPressSubmitProTemplate (ukbookmarks) verified!")
    
    print("All template instantiations completed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
