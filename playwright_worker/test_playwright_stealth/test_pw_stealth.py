import asyncio
import logging
from curl_cffi import requests as curl_requests
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

class PlaywrightStealthBypass:
    def __init__(self, proxies):
        self.proxies = proxies
        self.sessions = {}
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    async def get_cf_clearance(self, url):
        """Get clearance cookie using Playwright Stealth."""
        proxy = self.proxies[0] if self.proxies else None
        
        proxy_config = None
        if proxy:
            # Simple parsing for playwright proxy format if needed
            proxy_config = {"server": proxy}

        self.logger.info(f"Starting Playwright with Stealth to bypass Cloudflare on {url}...")
        
        async with async_playwright() as p:
            # We must use Chromium for maximum compatibility with stealth scripts
            browser = await p.chromium.launch(
                headless=False,
                args=["--disable-blink-features=AutomationControlled"]
            )
            
            context = await browser.new_context(
                proxy=proxy_config,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            
            page = await context.new_page()
            
            # Apply stealth to the page BEFORE navigation
            self.logger.info("Applying playwright-stealth patches...")
            stealth = Stealth()
            await stealth.apply_stealth_async(page)
            
            self.logger.info("Navigating to URL...")
            await page.goto(url)
            
            self.logger.info("Waiting 10 seconds for Cloudflare verification...")
            await asyncio.sleep(10)
            
            # Attempt to extract cookies
            cookies = await context.cookies()
            cf_cookie_val = None
            cookie_dict = {}
            
            for cookie in cookies:
                cookie_dict[cookie['name']] = cookie['value']
                if cookie['name'] == 'cf_clearance':
                    cf_cookie_val = cookie['value']
            
            # Get user agent
            user_agent = await page.evaluate("navigator.userAgent;")
            
            await browser.close()
            
            if cf_cookie_val:
                self.logger.info("Successfully extracted cf_clearance cookie!")
                self.sessions[url] = {
                    'cookie_dict': cookie_dict,
                    'proxy': proxy,
                    'user_agent': user_agent
                }
                return True
            else:
                self.logger.warning("Failed to extract cf_clearance cookie.")
                return False

    def request_with_session(self, url, session_url):
        """Make request using saved session via curl_cffi."""
        session = self.sessions.get(session_url)
        if not session:
            self.logger.error("No active session found for this URL.")
            return None
        
        self.logger.info(f"Making curl-impersonate request to {url} using saved session...")
        proxies = None
        if session['proxy']:
            proxies = {
                "http": session['proxy'],
                "https": session['proxy']
            }
            
        try:
            response = curl_requests.get(
                url,
                cookies=session['cookie_dict'],
                proxies=proxies,
                impersonate="chrome120",
                headers={"User-Agent": session['user_agent']},
                timeout=15
            )
            return response
        except Exception as e:
            self.logger.error(f"Curl request failed: {e}")
            return None


async def run_test():
    print("=== Playwright-Stealth Cloudflare Bypass Test ===")
    url = input("Enter target URL (e.g. https://livebookmarking.com/register): ").strip()
    if not url:
        print("URL required. Exiting.")
        return
        
    print("\nInitializing Playwright-Stealth bypasser...")
    proxies = [] 
    bypasser = PlaywrightStealthBypass(proxies)
    
    print(f"\nPhase 1: Getting clearance for {url}")
    success = await bypasser.get_cf_clearance(url)
    
    if success:
        print(f"\nPhase 2: Making curl_cffi request using clearance cookies")
        response = bypasser.request_with_session(url, url)
        if response:
            print(f"\nResponse Status: {response.status_code}")
            if response.status_code == 200:
                print("Bypass successful! The curl_cffi request worked.")
                if "challenge" not in response.text.lower() and "just a moment" not in response.text.lower() and "verify you are human" not in response.text.lower():
                     print("Confirmed: Page content loaded successfully. No Cloudflare challenge detected in response.")
                     print("--- Content Snippet ---")
                     print(response.text[:500])
                     print("-----------------------")
                else:
                     print("Warning: Response content still seems to contain Cloudflare challenge text.")
            else:
                print(f"Bypass might have failed. Status code: {response.status_code}")
        else:
            print("Failed to make request with session.")
    else:
         print("Failed to acquire clearance. Cannot proceed to Phase 2.")
    
if __name__ == "__main__":
    asyncio.run(run_test())
