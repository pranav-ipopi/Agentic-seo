import asyncio
import logging
import os
import sys

from methods.stealth_browser import StealthBrowserManager

async def main():
    print("Starting browser...")
    manager = StealthBrowserManager()
    await manager.start()
    
    try:
        page = await manager.get_page()
        print("Navigating to https://gorillasocialwork.com/register ...")
        await page.goto("https://gorillasocialwork.com/register", timeout=60000)
        
        print(f"Current URL: {page.url}")
        
        # wait a bit to see if challenge bypasses
        print("Waiting for 10 seconds to observe Cloudflare challenge...")
        await page.wait_for_timeout(10000)
        
        print(f"Final URL: {page.url}")
        title = await page.title()
        print(f"Page title: {title}")
        
        # Call the existing Cloudflare handler just in case
        from methods.stealth_browser import handle_cloudflare_challenge
        print("Attempting to run handle_cloudflare_challenge...")
        await handle_cloudflare_challenge(page)
        
        print(f"Post-challenge URL: {page.url}")
        
        await page.screenshot(path="gorilla_debug.png", full_page=True)
        print("Screenshot saved to gorilla_debug.png")
        
        body = await page.content()
        with open("gorilla_debug.html", "w", encoding="utf-8") as f:
            f.write(body)
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
