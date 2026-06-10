import asyncio
from playwright.async_api import async_playwright

async def get_form_details(page, url):
    print(f"\n=== {url} ===")
    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_timeout(1500)
    
    print(f"Title: {await page.title()}")
    print(f"URL: {page.url}")
    
    forms = await page.query_selector_all("form")
    print(f"Forms: {len(forms)}")
    
    for i, form in enumerate(forms):
        action = await form.get_attribute("action") or "N/A"
        method = await form.get_attribute("method") or "get"
        print(f"Form {i}: action={action}, method={method}")
        
        # Find all form controls
        controls = await form.query_selector_all("input, textarea, select, button[type=submit]")
        for ctrl in controls:
            tag = await ctrl.evaluate("e => e.tagName")
            name = await ctrl.get_attribute("name") or ""
            id_ = await ctrl.get_attribute("id") or ""
            typ = await ctrl.get_attribute("type") or ""
            val = await ctrl.get_attribute("value") or ""
            print(f"  {tag} name='{name}' id='{id_}' type='{typ}' value='{val}'")
    
    # Look for captcha images or iframes
    imgs = await page.query_selector_all("img")
    for img in imgs:
        src = await img.get_attribute("src") or ""
        if "captcha" in src.lower() or "solvemedia" in src.lower() or "adcopy" in src.lower():
            print(f"  Captcha img: {src}")
    
    # Print some body text
    text = await page.inner_text("body")
    print(f"Body snippet: {text[:300]}...")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        
        await get_form_details(page, "https://livebookmarking.com/login")
        await get_form_details(page, "https://livebookmarking.com/register")
        await get_form_details(page, "https://livebookmarking.com/submit")
        
        await browser.close()

asyncio.run(main())