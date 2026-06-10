import asyncio
from playwright_local.browser import BrowserManager

async def main():
    print("Launching persistent browser profile...")
    manager = BrowserManager()
    
    async with manager.new_context() as context:
        page = await context.new_page()
        
        print("Navigating to the registration page...")
        await page.goto("https://livebookmarking.com/register")
        
        print("\n*** ACTION REQUIRED ***")
        print("Please manually click the Cloudflare Turnstile checkbox in the browser window.")
        print("Once you solve it and the registration form appears, the clearance cookie will be saved!")
        print("Waiting 60 seconds for you to solve it...")
        
        await page.wait_for_timeout(60000)
        print("Finished waiting. The persistent profile should now be trusted.")

if __name__ == "__main__":
    asyncio.run(main())
