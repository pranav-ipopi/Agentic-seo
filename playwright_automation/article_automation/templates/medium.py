import asyncio

async def submit_article(page, title: str, body: str, target_url: str) -> str:
    """
    Submits an article to Medium.
    Assumes the page is already loaded with an authenticated session.
    """
    print("Navigating to Medium new story page...")
    await page.goto("https://medium.com/new-story", wait_until="domcontentloaded")
    
    # Wait for the title field
    print("Filling title...")
    title_element = page.locator("h3.editor-title")
    await title_element.wait_for(state="visible", timeout=15000)
    await title_element.fill(title)
    await page.keyboard.press("Enter")
    
    print("Filling body...")
    # Add body text
    await page.keyboard.insert_text(body)
    await page.keyboard.press("Enter")
    
    print(f"Adding backlink to {target_url}...")
    await page.keyboard.insert_text(f"Read more: {target_url}")
    
    print("Publishing...")
    # Click Publish button (top nav)
    publish_btn = page.locator('button:has-text("Publish")')
    await publish_btn.wait_for(state="visible")
    await publish_btn.click()
    
    # In the publish modal, click Publish now
    publish_now_btn = page.locator('button:has-text("Publish now")')
    await publish_now_btn.wait_for(state="visible")
    await publish_now_btn.click()
    
    # Wait for navigation to the published article
    print("Waiting for publication...")
    await page.wait_for_load_state("networkidle")
    
    published_url = page.url
    print(f"Successfully published on Medium: {published_url}")
    return published_url
