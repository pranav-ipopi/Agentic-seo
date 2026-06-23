import asyncio
from seleniumbase import cdp_driver
from playwright.async_api import async_playwright

async def main():
    # DO NOT pass proxy to cdp_driver
    driver = await cdp_driver.start_async()
    
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(driver.get_endpoint_url())
        
        # Pass proxy to Playwright context
        proxy = {
            "server": "http://ap.proxy.2captcha.com:2334",
            "username": "u7744f283557105b7-zone-custom",
            "password": "u7744f283557105b7"
        }
        
        context = await browser.new_context(proxy=proxy)
        page = await context.new_page()
        print("Navigating...")
        try:
            await page.goto("https://api.ipify.org", timeout=15000)
            content = await page.content()
            print("Success! IP:", content)
        except Exception as e:
            print("Failed:", e)
        finally:
            await browser.close()
            driver.quit()

asyncio.run(main())
