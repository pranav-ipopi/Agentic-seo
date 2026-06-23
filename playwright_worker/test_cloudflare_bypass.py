import asyncio
from methods.stealth_browser import StealthBrowserManager, handle_cloudflare_challenge

async def main():
    manager = StealthBrowserManager()
    await manager.start()
    try:
        page = await manager.get_page()
        print("Navigating to letusbookmark.com...")
        await page.goto("https://letusbookmark.com/")
        print("Handling cloudflare challenge...")
        success = await handle_cloudflare_challenge(page)
        print(f"Cloudflare bypass success: {success}")
        print("Taking screenshot to verify...")
        await page.screenshot(path="cf_test_result.png")
    finally:
        await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
