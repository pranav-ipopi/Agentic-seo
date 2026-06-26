import asyncio
import logging
import nodriver as uc
from playwright.async_api import async_playwright
from curl_cffi import requests as curl_requests

class NodriverPlaywrightBypass:
    def __init__(self):
        self.sessions = {}
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    async def get_cf_clearance(self, url):
        self.logger.info(f"Starting Nodriver to bypass Cloudflare on {url}...")
        
        # Step 1: Launch ultra-stealthy Chrome using Nodriver
        uc_browser = await uc.start(headless=False)
        cdp_port = uc_browser.config.port
        endpoint_url = f"http://127.0.0.1:{cdp_port}"
        
        self.logger.info(f"Nodriver running on port {cdp_port}. Connecting Playwright...")
        
        # Step 2: Connect Playwright to the Nodriver instance over CDP
        async with async_playwright() as p:
            pw_browser = await p.chromium.connect_over_cdp(endpoint_url)
            
            # Nodriver creates a default page, get it via Playwright
            contexts = pw_browser.contexts
            if contexts:
                pages = contexts[0].pages
                if pages:
                    page = pages[0]
                else:
                    page = await contexts[0].new_page()
            else:
                context = await pw_browser.new_context()
                page = await context.new_page()
                
            self.logger.info("Navigating to URL using Playwright...")
            await page.goto(url)
            
            self.logger.info("Waiting for Cloudflare challenge...")
            await asyncio.sleep(4)
            
            # Step 3: Use Playwright to check for and click the Turnstile checkbox
            cf_iframe = page.locator('iframe[src*="cloudflare.com/cdn-cgi/challenge-platform"]')
            if await cf_iframe.count() > 0:
                self.logger.info("Cloudflare Turnstile iframe detected! Attempting to click...")
                try:
                    # Wait for the checkbox to be ready and click it inside the iframe
                    await cf_iframe.content_frame.locator('body').click(timeout=5000)
                    self.logger.info("Clicked the Turnstile box.")
                except Exception as e:
                    self.logger.warning(f"Could not click Turnstile: {e}")
            else:
                self.logger.info("No visible Turnstile iframe detected.")
                
            self.logger.info("Waiting 8 seconds for clearance...")
            await asyncio.sleep(8)
            
            # Extract cookies
            context = page.context
            cookies = await context.cookies()
            cf_cookie_val = None
            cookie_dict = {}
            
            for cookie in cookies:
                cookie_dict[cookie['name']] = cookie['value']
                if cookie['name'] == 'cf_clearance':
                    cf_cookie_val = cookie['value']
            
            # Get user agent
            user_agent = await page.evaluate("navigator.userAgent;")
            
            await pw_browser.close()
            
        # Stop Nodriver Chrome instance safely
        # Note: calling stop directly on uc_browser can sometimes trigger asyncio errors
        # if the pipes are closed by Playwright closing the connection, but we try anyway.
        try:
            uc_browser.stop()
        except:
            pass
            
        if cf_cookie_val:
            self.logger.info("Successfully extracted cf_clearance cookie!")
            self.sessions[url] = {
                'cookie_dict': cookie_dict,
                'proxy': None,
                'user_agent': user_agent
            }
            return True
        else:
            self.logger.warning("Failed to extract cf_clearance cookie.")
            return False

    def request_with_session(self, url, session_url):
        session = self.sessions.get(session_url)
        if not session:
            self.logger.error("No active session found for this URL.")
            return None
        
        self.logger.info(f"Making curl-impersonate request to {url} using saved session...")
        try:
            response = curl_requests.get(
                url,
                cookies=session['cookie_dict'],
                impersonate="chrome120",
                headers={"User-Agent": session['user_agent']},
                timeout=15
            )
            return response
        except Exception as e:
            self.logger.error(f"Curl request failed: {e}")
            return None


async def run_test():
    print("=== Nodriver + Playwright Combined Bypass Test ===")
    url = input("Enter target URL (e.g. https://livebookmarking.com/register): ").strip()
    if not url:
        print("URL required. Exiting.")
        return
        
    print("\nInitializing hybrid bypasser...")
    bypasser = NodriverPlaywrightBypass()
    
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
