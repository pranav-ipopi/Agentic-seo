import asyncio
import re
from camoufox.async_api import AsyncCamoufox

async def main():
    sitekey = None
    
    async def handle_request(request):
        nonlocal sitekey
        # Check URLs for sitekey parameter
        if "sitekey=" in request.url:
            match = re.search(r'sitekey=([^&]+)', request.url)
            if match:
                sitekey = match.group(1)
                print(f"Intercepted sitekey from request: {sitekey}")

    async def handle_response(response):
        nonlocal sitekey
        try:
            # Check response bodies for sitekey pattern (0x4...)
            if "cloudflare" in response.url:
                text = await response.text()
                match = re.search(r'(0x4[A-Za-z0-9_-]+)', text)
                if match:
                    sitekey = match.group(1)
                    print(f"Intercepted sitekey from response body: {sitekey}")
        except:
            pass

    async with AsyncCamoufox(headless=False) as browser:
        page = await browser.new_page()
        page.on("request", handle_request)
        page.on("response", handle_response)
        
        await page.goto("https://livebookmarking.com/submit", wait_until="domcontentloaded")
        
        print("Waiting for Cloudflare challenge...")
        await page.wait_for_timeout(10000)
        
        if sitekey:
            print(f"SUCCESS: Found sitekey: {sitekey}")
        else:
            print("Failed to find sitekey via network interception.")

if __name__ == "__main__":
    asyncio.run(main())
