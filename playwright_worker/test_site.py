import sys
import asyncio
import argparse
from methods.stealth_browser import StealthBrowserManager, handle_cloudflare_challenge

async def main():
    parser = argparse.ArgumentParser(description="Test Cloudflare bypass on a given URL using stealth browser.")
    parser.add_argument("url", help="The URL to test")
    args = parser.parse_args()

    url = args.url
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    print(f"Initializing stealth browser for {url}...")
    manager = StealthBrowserManager()
    await manager.start()
    
    try:
        page = await manager.get_page()
        print(f"Navigating to {url}...")
        
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        print("Handling cloudflare challenge if present...")
        success = await handle_cloudflare_challenge(page)
        
        print(f"\n--- RESULTS ---")
        print(f"Cloudflare bypass returned: {success}")
        
        final_url = page.url
        title = await page.title()
        print(f"Final URL: {final_url}")
        print(f"Page Title: {title}")
        
        screenshot_path = "test_site_result.png"
        print(f"Taking screenshot to {screenshot_path}...")
        await page.screenshot(path=screenshot_path)
        print("Done!")
    except Exception as e:
        print(f"Error occurred: {e}")
    finally:
        await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
