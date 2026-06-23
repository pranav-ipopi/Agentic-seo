import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(ignore_https_errors=True)
        page = await context.new_page()
        print("Navigating to bookmarkloves.com...")
        response = await page.goto("https://bookmarkloves.com", timeout=30000)
        print(f"Status: {response.status}")
        print(f"Title: {await page.title()}")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
