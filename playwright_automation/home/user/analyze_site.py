import asyncio
from playwright.async_api import async_playwright
import json

async def analyze_page(page, url, name):
    print(f"\n=== Analyzing {name} at {url} ===")
    await page.goto(url, wait_until="networkidle", timeout=30000)
    await page.wait_for_timeout(2000)  # wait for any JS
    
    # Get title
    title = await page.title()
    print(f"Title: {title}")
    
    # Get all forms
    forms = await page.query_selector_all("form")
    print(f"Number of forms: {len(forms)}")
    
    for i, form in enumerate(forms):
        action = await form.get_attribute("action") or ""
        method = await form.get_attribute("method") or "get"
        print(f"  Form {i}: action='{action}' method='{method}'")
        
        # Get inputs
        inputs = await form.query_selector_all("input, textarea, select, button")
        for inp in inputs:
            tag = await inp.evaluate("el => el.tagName.toLowerCase()")
            name_attr = await inp.get_attribute("name") or ""
            id_attr = await inp.get_attribute("id") or ""
            type_attr = await inp.get_attribute("type") or ""
            value = await inp.get_attribute("value") or ""
            placeholder = await inp.get_attribute("placeholder") or ""
            print(f"    {tag}: name='{name_attr}' id='{id_attr}' type='{type_attr}' value='{value}' placeholder='{placeholder}'")
    
    # Also get all input fields on page
    all_inputs = await page.query_selector_all("input, textarea, select")
    print(f"\nAll page inputs ({len(all_inputs)}):")
    for inp in all_inputs:
        name_attr = await inp.get_attribute("name") or ""
        id_attr = await inp.get_attribute("id") or ""
        type_attr = await inp.get_attribute("type") or ""
        if name_attr or id_attr:
            print(f"  name='{name_attr}' id='{id_attr}' type='{type_attr}'")
    
    # Get links that might be relevant
    links = await page.query_selector_all("a")
    relevant_links = []
    for link in links:
        href = await link.get_attribute("href") or ""
        text = (await link.inner_text() or "").strip().lower()
        if any(kw in text for kw in ["submit", "login", "register", "sign", "bookmark", "story"]):
            relevant_links.append((text[:50], href))
    if relevant_links:
        print(f"\nRelevant links:")
        for text, href in relevant_links[:10]:
            print(f"  '{text}' -> {href}")
    
    # Check for captcha
    captcha_elements = await page.query_selector_all("[class*='captcha'], [id*='captcha'], img[src*='captcha'], [class*='solvemedia']")
    print(f"\nPossible captcha elements: {len(captcha_elements)}")
    for el in captcha_elements[:5]:
        tag = await el.evaluate("el => el.tagName.toLowerCase()")
        src = await el.get_attribute("src") or ""
        cls = await el.get_attribute("class") or ""
        print(f"  {tag}: class='{cls}' src='{src[:100] if src else ''}'")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )
        page = await context.new_page()
        
        # Analyze login
        await analyze_page(page, "https://livebookmarking.com/login", "Login")
        
        # Analyze register
        await analyze_page(page, "https://livebookmarking.com/register", "Register")
        
        # Analyze submit (will likely be login or challenge)
        await analyze_page(page, "https://livebookmarking.com/submit", "Submit")
        
        # Try submit.php
        await analyze_page(page, "https://livebookmarking.com/submit.php", "Submit.php")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())