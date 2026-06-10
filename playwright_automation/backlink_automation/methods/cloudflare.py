import asyncio

async def bypass_cloudflare(page, max_retries=15):
    """
    Wait for Cloudflare to naturally pass due to our stealthy browser.
    Returns True if successfully bypassed, False if it times out.
    """
    print("Checking for Cloudflare protection...")
    
    # Wait for up to max_retries seconds to see if the page clears Cloudflare automatically
    for _ in range(max_retries):
        try:
            title = await page.title()
            if "Just a moment" not in title and "Verify you are human" not in title:
                print("Successfully bypassed Cloudflare (or no Cloudflare detected).")
                return True
                
            print("Waiting for Cloudflare check to complete natively...")
            
            # Sometimes you might still get the Turnstile checkbox, even with a stealth browser.
            # We attempt to click it if it appears.
            cf_frames = await page.locator('iframe[src*="challenge-platform"], iframe[src*="turnstile"]').count()
            if cf_frames > 0:
                print("Clicking the Turnstile widget directly...")
                iframe_element = await page.query_selector('iframe[src*="challenge-platform"], iframe[src*="turnstile"]')
                if iframe_element:
                    await iframe_element.click()
        except Exception as e:
            if "Execution context was destroyed" in str(e):
                print("Navigation detected! Cloudflare check passed.")
                # Give it a moment to finish loading the target page
                await page.wait_for_timeout(2000)
                return True
            # Other temporary playwright errors during load
            pass
            
        await page.wait_for_timeout(1000)
        
    print("Warning: Cloudflare might still be active, but continuing anyway.")
    return False
