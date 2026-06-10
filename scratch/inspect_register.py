import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from playwright_automation.backlink_automation.methods.stealth_browser import StealthBrowserManager
from playwright_automation.backlink_automation.methods.cloudflare import bypass_cloudflare

async def main():
    manager = StealthBrowserManager()
    await manager.start()
    page = await manager.get_page()
    await page.goto("https://livebookmarking.com/register", wait_until="domcontentloaded")
    await bypass_cloudflare(page)
    
    # Wait for the form to appear
    await page.wait_for_selector('input[type="password"]', timeout=30000)
    
    # Dump all input IDs
    inputs = await page.evaluate('''() => {
        return Array.from(document.querySelectorAll('input')).map(i => {
            return {
                id: i.id,
                name: i.name,
                type: i.type,
                placeholder: i.placeholder
            }
        });
    }''')
    for i in inputs:
        print(i)
        
    await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
