import asyncio
import time
from playwright.async_api import async_playwright
from local_worker import create_driver, get_cdp_ws_url

async def main():
    print("Launching SeleniumBase UC Mode (like local_worker)...")
    # Use worker_id 99 for this test to not interfere with real profiles
    driver = create_driver(worker_id=99)
    
    print("Driver created. Injecting WebGL/Canvas spoofing...")
    # Give it a second to settle
    time.sleep(2)
    
    print("Extracting CDP WebSocket URL...")
    cdp_ws = get_cdp_ws_url(driver)
    
    if not cdp_ws:
        print("Failed to get CDP WS URL. Exiting.")
        driver.quit()
        return

    print(f"CDP URL found: {cdp_ws}")
    print("Handing over to Playwright...")
    
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(cdp_ws)
        ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        
        print("Navigating to https://creepjs.org/ ...")
        await page.goto("https://creepjs.org/")
        
        print("\n" + "="*50)
        print("CreepJS is running! Please look at the opened Chrome window.")
        print("It takes about 5-10 seconds for CreepJS to calculate the final Trust Score.")
        print("When you are done reviewing, close the Chrome window or press Ctrl+C here.")
        print("="*50 + "\n")
        
        # Keep the script running so the user can look at the browser
        try:
            while True:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            pass

    print("Closing browser...")
    driver.quit()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nTest stopped.")
