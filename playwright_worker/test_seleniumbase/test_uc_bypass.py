import time
import random
import logging
from curl_cffi import requests as curl_requests
from seleniumbase import SB

class SeleniumBaseCloudflareBypass:
    def __init__(self, proxies):
        self.proxies = proxies
        self.sessions = {}
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

    def get_cf_clearance(self, url):
        """Get clearance cookie using SeleniumBase UC mode."""
        proxy = random.choice(self.proxies) if self.proxies else None
        proxy_arg = proxy if proxy else ""

        self.logger.info(f"Starting SeleniumBase to bypass Cloudflare on {url}...")
        
        # Use SB context manager with uc=True for Undetected Chromedriver mode
        with SB(uc=True, headless=False, proxy=proxy_arg) as sb:
            self.logger.info("Opening page with reconnect handling...")
            # uc_open_with_reconnect handles the initial load and anti-bot checks
            sb.uc_open_with_reconnect(url, reconnect_time=5)
            
            # Wait for Cloudflare challenge to potentially appear and auto-resolve
            self.logger.info("Waiting for Cloudflare verification...")
            sb.sleep(3)
            
            # SeleniumBase built-in method to handle Turnstile if it requires a click
            try:
                # This will click the Turnstile checkbox if it exists and is visible
                sb.uc_gui_click_captcha()
                self.logger.info("Attempted to click Turnstile captcha if present.")
            except Exception as e:
                self.logger.info(f"No clickable captcha found or error clicking: {e}")
                
            sb.sleep(5) # Wait for clearance after solving
            
            # Extract cookies
            cookies_list = sb.driver.get_cookies()
            cf_cookie_val = None
            cookie_dict = {}
            
            for cookie in cookies_list:
                cookie_dict[cookie['name']] = cookie['value']
                if cookie['name'] == 'cf_clearance':
                    cf_cookie_val = cookie['value']
            
            # Get user agent
            user_agent = sb.driver.execute_script("return navigator.userAgent;")
            
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


def run_test():
    print("=== SeleniumBase UC Cloudflare Bypass Test ===")
    url = input("Enter target URL (e.g. https://livebookmarking.com/register): ").strip()
    if not url:
        print("URL required. Exiting.")
        return
        
    print("\nInitializing SeleniumBase bypasser...")
    # Add proxies to this list if you want to test with them, e.g., ["http://user:pass@host:port"]
    proxies = [] 
    bypasser = SeleniumBaseCloudflareBypass(proxies)
    
    print(f"\nPhase 1: Getting clearance for {url}")
    success = bypasser.get_cf_clearance(url)
    
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
    run_test()
