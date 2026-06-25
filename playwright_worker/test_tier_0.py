import asyncio
from methods.stealth_browser import StealthBrowserManager, handle_cloudflare_challenge
from services.proxy_manager import ProxyManager

async def test_tier_0():
    url = "https://2captcha.com/demo/cloudflare-turnstile-challenge"
    
    print("Initializing ProxyManager (Tier 0 Cache Layer)...")
    proxy_manager = ProxyManager()
    
    print("Initializing StealthBrowserManager...")
    manager = StealthBrowserManager()
    
    # We will use a mock proxy name "direct_ip" to trick the ProxyManager 
    # into caching our cookies without actually using a proxy server.
    original_build_proxy = manager._build_proxy_dict
    manager._build_proxy_dict = lambda: None  # Return None to Playwright so it doesn't use a proxy
    
    await manager.start()
    
    # Tell the browser to bind this session to our "direct_ip" profile in ProxyManager
    manager.set_proxy("direct_ip", proxy_manager)
    
    try:
        print("\n===========================================")
        print("   VISIT 1: First Request (No Cached Cookie)")
        print("===========================================")
        page1 = await manager.get_page()
        
        print(f"Navigating to {url}...")
        await page1.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        # Let Tier 1 handle the challenge natively
        success = await handle_cloudflare_challenge(page1)
        print(f"Bypass 1 completed: {success}")
        
        print("\n[Harvesting Cookie] Extracting the cf_clearance cookie we just earned...")
        cookies = await page1.context.cookies()
        cf_clearance_cookie = None
        for c in cookies:
            if c.get('name') == 'cf_clearance':
                cf_clearance_cookie = c
                break
                
        if cf_clearance_cookie:
            # We explicitly cache this cookie in the ProxyManager under our "direct_ip" profile
            user_agent = await page1.evaluate("navigator.userAgent")
            proxy_manager.set_cf_clearance("direct_ip", cf_clearance_cookie, user_agent)
            print("SUCCESS: Cookie harvested and cached in Tier 0!")
        else:
            print("FAILED: No cf_clearance cookie found after bypass.")
            
        await page1.context.close()
        
        
        print("\n===========================================")
        print("   VISIT 2: Second Request (Tier 0 Cache)")
        print("===========================================")
        print("Opening a BRAND NEW isolated incognito browser context...")
        # When get_page() is called, StealthBrowserManager will see the "direct_ip" proxy,
        # ask ProxyManager for the cookie, and inject it before the page even loads!
        page2 = await manager.get_page()
        
        # --- PROOF FOR YOU ---
        injected_cookies = await page2.context.cookies()
        print(f"\n[Proof] Cookies currently sitting in Visit 2 Browser BEFORE loading the page:")
        for c in injected_cookies:
            print(f"  -> Name: {c['name']} | Domain: {c['domain']} | Value: {c['value'][:20]}...")
        # ---------------------
        
        print(f"\nNavigating to {url} again...")
        await page2.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        # Give it a second to load
        await asyncio.sleep(3)
        
        title2 = await page2.title()
        print(f"Final URL on Visit 2: {page2.url}")
        print(f"Page Title on Visit 2: {title2}")
        
        if "Just a moment" not in title2 and "challenge" not in page2.url:
            print("\n🎉 SUCCESS: Tier 0 successfully injected the cached cookie and skipped Cloudflare entirely! No checkbox needed.")
        else:
            print("\nFAILED: Cloudflare challenge still appeared.")
            
        await page2.screenshot(path="tier0_result.png")
        print("Saved screenshot to tier0_result.png")
        
    finally:
        await manager.close()

if __name__ == "__main__":
    asyncio.run(test_tier_0())
