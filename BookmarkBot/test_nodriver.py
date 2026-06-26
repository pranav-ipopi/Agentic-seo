import asyncio
import nodriver as uc

async def main():
    browser = await uc.start(headless=False)
    print("Getting page...")
    page = await browser.get("https://livebookmarking.com")
    print("Page:", type(page))
    
    # Let's see what methods are available for cookies
    cookies_mgr = browser.cookies
    print("Cookies object:", type(cookies_mgr))
    
    all_cookies = await browser.cookies.get_all()
    print("All cookies type:", type(all_cookies))
    
    await browser.stop()

if __name__ == '__main__':
    asyncio.run(main())
