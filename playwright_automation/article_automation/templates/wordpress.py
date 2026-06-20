import asyncio

async def submit_article(page, title: str, body: str, target_url: str) -> str:
    """
    Submits an article to WordPress.com.
    Assumes the page is already loaded with an authenticated session.
    """
    print("Navigating to WordPress new post page...")
    # Default WP.com post editor URL
    await page.goto("https://wordpress.com/post", wait_until="domcontentloaded")
    
    print("Filling title...")
    title_input = page.locator('h1.wp-block-post-title, textarea[placeholder="Add title"]').first
    await title_input.wait_for(state="visible", timeout=20000)
    await title_input.fill(title)
    
    print("Filling body...")
    await page.keyboard.press("Enter")
    await page.keyboard.insert_text(f"{body}\n\nRead more: {target_url}")
    
    print("Publishing...")
    # First publish button click
    publish_btn = page.locator('button.editor-post-publish-panel__toggle, button:has-text("Publish")').first
    await publish_btn.click()
    
    # Confirm publish
    publish_confirm = page.locator('button.editor-post-publish-button, button.is-primary:has-text("Publish")').first
    await publish_confirm.wait_for(state="visible")
    await publish_confirm.click()
    
    print("Waiting for publication...")
    await page.wait_for_timeout(5000)
    
    # Try to find the View Post link
    try:
        view_post_link = page.locator('a:has-text("View Post"), a:has-text("View post")').first
        await view_post_link.wait_for(state="visible", timeout=10000)
        published_url = await view_post_link.get_attribute("href")
    except Exception:
        published_url = page.url
        
    print(f"Successfully published on WordPress: {published_url}")
    return published_url or page.url
