import asyncio

async def submit_article(page, title: str, body: str, target_url: str) -> str:
    """
    Submits a post to Reddit (to the user's own profile).
    Assumes the page is already loaded with an authenticated session.
    """
    print("Navigating to Reddit submission page...")
    await page.goto("https://www.reddit.com/submit", wait_until="domcontentloaded")
    
    # Needs a subreddit or profile. We assume user profile for articles.
    # The actual selectors can vary a lot depending on the Reddit UI version, this is a generic structure
    print("Waiting for title input...")
    title_input = page.locator('textarea[placeholder="Title"], input[placeholder="Title"]').first
    await title_input.wait_for(state="visible", timeout=15000)
    await title_input.fill(title)
    
    # Body
    print("Waiting for body input...")
    # Reddit redesign uses contenteditable div for editor
    editor = page.locator('div[contenteditable="true"]').first
    await editor.click()
    await page.keyboard.insert_text(f"{body}\n\nRead more: {target_url}")
    
    print("Publishing...")
    # Post button
    post_btn = page.locator('button:has-text("Post")').first
    await post_btn.click()
    
    print("Waiting for publication...")
    await page.wait_for_timeout(5000) # Give it some time to redirect
    await page.wait_for_load_state("networkidle")
    
    published_url = page.url
    print(f"Successfully published on Reddit: {published_url}")
    return published_url
