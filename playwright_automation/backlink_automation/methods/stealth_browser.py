import asyncio
from seleniumbase import cdp_driver
from playwright.async_api import async_playwright

class StealthBrowserManager:
    """
    Manages a stealthy Chromium session via SeleniumBase CDP Mode 
    and connects Playwright to it. This completely avoids Cloudflare/Bot 
    detections by running a natively undetected chromedriver.
    """
    def __init__(self):
        self.driver = None
        self._playwright_context_manager = None
        self.playwright = None
        self.browser = None

    async def start(self):
        """Starts the stealth browser and attaches Playwright."""
        print("Starting Stealth Browser (SeleniumBase CDP)...")
        # cdp_driver.start_async creates an undetected-chromedriver stealthy session.
        self.driver = await cdp_driver.start_async()
        endpoint_url = self.driver.get_endpoint_url()
        print(f"CDP Endpoint URL: {endpoint_url}")
        
        # Connect Playwright to the stealthy session
        self._playwright_context_manager = async_playwright()
        self.playwright = await self._playwright_context_manager.__aenter__()
        
        self.browser = await self.playwright.chromium.connect_over_cdp(endpoint_url)
        print("Playwright successfully connected to the stealth browser.")
        return self.browser

    async def get_page(self):
        """Creates and returns a new isolated page context from the stealth browser session."""
        if not self.browser:
            raise Exception("Browser not started. Call start() first.")
        
        # Always create a new isolated context for concurrency.
        # IMPORTANT: We explicitly set 1920x1080 — do NOT use no_viewport=True.
        # no_viewport inherits the VPS/CDP window size which can be undefined or tiny in headless mode,
        # causing responsive CSS to push the Submit button off-screen (reproduces the Playwright timeout).
        # This was the fix from walkthrough c42e983e and must be kept.
        context = await self.browser.new_context(viewport={"width": 1920, "height": 1080})
        return await context.new_page()

    async def close(self):
        """Closes the Playwright connection and stealth browser."""
        if self.browser:
            await self.browser.close()
        
        if self._playwright_context_manager:
            await self._playwright_context_manager.__aexit__(None, None, None)
            
        if self.driver:
            try:
                self.driver.quit()
            except Exception as e:
                print(f"Error closing cdp_driver: {e}")
                
        print("Stealth Browser closed.")
