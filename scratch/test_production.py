import asyncio
import logging
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../playwright_automation/backlink_automation")))

from templates.bookmarkingera import BookmarkingEraTemplate
from methods.stealth_browser import StealthBrowserManager
from services.captcha_service import CaptchaService

async def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger("test_prod")
    
    browser_manager = StealthBrowserManager()
    captcha_service = CaptchaService(logger=logger)
    
    await browser_manager.start()
    page = None
    try:
        template = BookmarkingEraTemplate(
            browser_manager=browser_manager,
            captcha_service=captcha_service,
            logger=logger
        )
        
        # Open page first so we can access context on error
        page = await browser_manager.get_page()
        
        # Override the template run slightly by patching the page access
        original_get_page = browser_manager.get_page
        async def patched_get_page():
            return page
        browser_manager.get_page = patched_get_page
        
        client_site = f"https://www.prodtest-{os.urandom(4).hex()}.org"
        keyword = "Advanced SEO Automation Software"
        
        result = await template.run(client_site, keyword)
        print("\n" + "=" * 50)
        print("PRODUCTION TEMPLATE RUN RESULT:")
        print(result)
        print("=" * 50 + "\n")
        
    except Exception as e:
        print(f"Error during production template run: {e}")
        if page:
            try:
                # Wait 2 seconds for page to settle
                await asyncio.sleep(2)
                html_content = await page.content()
                with open("c:/Users/IPOPI/Desktop/Agentic-seo/scratch/prod_error_page.html", "w", encoding="utf-8") as f:
                    f.write(html_content)
                await page.screenshot(path="c:/Users/IPOPI/Desktop/Agentic-seo/scratch/prod_error_screenshot.png")
                print("Error page saved to scratch/prod_error_page.html and screenshot saved to scratch/prod_error_screenshot.png")
            except Exception as capture_err:
                print(f"Could not capture error state: {capture_err}")
    finally:
        await browser_manager.close()

if __name__ == "__main__":
    asyncio.run(main())
