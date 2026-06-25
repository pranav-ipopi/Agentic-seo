import asyncio
import os
import sys
import logging
from dotenv import load_dotenv

load_dotenv()

# Ensure imports work when run from this folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from methods.stealth_browser import StealthBrowserManager, handle_cloudflare_challenge
from services.proxy_manager import ProxyManager

async def test_bypass():
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    # Make sure to set DATAIMPULSE_LOGIN and DATAIMPULSE_PASSWORD in your VPS environment!
    os.environ["USE_PROXY"] = "true"

    print("Initializing ProxyManager...")
    proxy_manager = ProxyManager()
    
    print("Initializing StealthBrowserManager...")
    browser_manager = StealthBrowserManager()
    await browser_manager.start()

    # Get a working proxy (if USE_PROXY is true)
    proxy = await proxy_manager.get_working_proxy(browser_manager)
    print(f"Using proxy: {proxy}")
    
    # We must explicitly set the proxy before getting a page
    browser_manager.set_proxy(proxy, proxy_manager)
    
    print("Creating new isolated stealth page...")
    page = await browser_manager.get_page()
    
    # We know nybookmark.com uses strict Cloudflare turnstile
    target_url = "https://nybookmark.com/register"
    print(f"Navigating to {target_url} ...")
    
    try:
        await page.goto(target_url, wait_until="domcontentloaded", timeout=60000)
        
        # Give Cloudflare a moment to load Turnstile if it's there
        await asyncio.sleep(3)
        
        print("Checking for Cloudflare Challenge...")
        bypass_success = await handle_cloudflare_challenge(page)
        
        print(f"\n--- TEST RESULTS ---")
        print(f"Bypass Function Returned: {bypass_success}")
        print(f"Final URL: {page.url}")
        title = await page.title()
        print(f"Final Page Title: {title}")
        
        # Verify if cookies were harvested
        if proxy:
            cookies = proxy_manager.get_all_cf_clearance(proxy)
            print(f"Tier 0 Cache Check: Found {len(cookies)} cached cf_clearance cookies for this proxy.")
        
    except Exception as e:
        print(f"Error during test: {e}")
    finally:
        await page.context.close()
        await browser_manager.close()

if __name__ == "__main__":
    asyncio.run(test_bypass())
