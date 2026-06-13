import asyncio
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../playwright_automation/backlink_automation")))

from methods.stealth_browser import StealthBrowserManager

async def main():
    manager = StealthBrowserManager()
    await manager.start()
    
    try:
        page = await manager.get_page()
        
        print("Navigating to bookmarks/all page...")
        await page.goto("https://bookmarkingera.com/bookmarks/all", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        
        html = await page.content()
        with open("c:/Users/IPOPI/Desktop/Agentic-seo/scratch/all_bookmarks_page.html", "w", encoding="utf-8") as f:
            f.write(html)
        
        print("Successfully saved scratch/all_bookmarks_page.html")
        
        # Find all <a> links containing "/bookmark/"
        links = await page.evaluate('''() => {
            return Array.from(document.querySelectorAll('a'))
                .map(a => a.href)
                .filter(href => href.includes('/bookmark/') || href.includes('/bookmarks/'));
        }''')
        
        print("Found bookmark/bookmarks links:")
        for l in set(links)[:15]:
            print(f" - {l}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
