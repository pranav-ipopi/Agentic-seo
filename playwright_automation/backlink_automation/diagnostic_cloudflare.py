import asyncio
from camoufox.async_api import AsyncCamoufox

async def main():
    async with AsyncCamoufox(headless=False) as browser:
        page = await browser.new_page()
        
        page.on(
            "request",
            lambda r: print("REQ:", r.url) if "challenge" in r.url or "turnstile" in r.url or "api.js" in r.url else None
        )

        print("Navigating to livebookmarking.com/submit...")
        await page.goto("https://livebookmarking.com/submit", wait_until="domcontentloaded")
        
        print("Waiting 5 seconds for Cloudflare...")
        await page.wait_for_timeout(5000)
        
        print("Title:", await page.title())

        cf_opt = await page.evaluate("""
        () => {
            return window._cf_chl_opt || null;
        }
        """)

        print("CF_OPT:")
        print(cf_opt)

        print("Frames:")
        for frame in page.frames:
            print("FRAME:", frame.url)

        html = await page.content()
        print("_cf_chl_opt in html:", "_cf_chl_opt" in html)

if __name__ == "__main__":
    asyncio.run(main())
