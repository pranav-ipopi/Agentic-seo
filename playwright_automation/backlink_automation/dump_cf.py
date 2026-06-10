import asyncio
from playwright_local.browser import BrowserManager

async def main():
    manager = BrowserManager()
    
    async with manager.new_context() as context:
        page = await context.new_page()
        
        print("Navigating to the registration page...")
        await page.goto("https://livebookmarking.com/register")
        
        print("Waiting for challenge page to settle...")
        await page.wait_for_timeout(5000)
        
        html = await page.content()
        with open("cf_challenge_dump.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Dumped to cf_challenge_dump.html")

if __name__ == "__main__":
    asyncio.run(main())
