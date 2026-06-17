import asyncio
import os
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
        use_proxy = os.getenv("USE_PROXY", "false").lower() == "true"
        proxy_url = os.getenv("PROXY_URL") if use_proxy else None
        
        if proxy_url:
            print(f"Proxy enabled. Will apply proxy to Playwright context.")
        else:
            print("Running without proxy (USE_PROXY is false or missing)")
            
        # Do NOT pass proxy to start_async, otherwise Chromium prompts for auth natively!
        # We will handle it in the Playwright context.
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
        
        use_proxy = os.getenv("USE_PROXY", "false").lower() == "true"
        proxy_url = os.getenv("PROXY_URL") if use_proxy else None
        proxy_dict = None
        
        if proxy_url:
            from urllib.parse import urlparse
            parsed = urlparse(proxy_url)
            if parsed.username and parsed.password:
                proxy_dict = {
                    "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}",
                    "username": parsed.username,
                    "password": parsed.password
                }
            else:
                proxy_dict = {"server": proxy_url}
        
        # Always create a new isolated context for concurrency.
        # We pass the proxy configuration directly into the context to bypass native auth popups.
        context = await self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            proxy=proxy_dict
        )
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
