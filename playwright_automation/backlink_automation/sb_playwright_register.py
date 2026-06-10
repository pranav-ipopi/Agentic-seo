import asyncio
import random
import string

# Import our new reusable components!
from methods import StealthBrowserManager, bypass_cloudflare

def generate_random_credentials():
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    username = f"backlink_{suffix}"
    email = f"{username}@mailinator.com"
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    return {"username": username, "email": email, "password": password}

async def main():
    # 1. Initialize our reusable stealth browser
    manager = StealthBrowserManager()
    await manager.start()
    
    try:
        # 2. Get the active page
        page = await manager.get_page()
        
        target_url = "https://livebookmarking.com/register"
        print(f"Navigating to {target_url}...")
        
        # Navigate
        await page.goto(target_url, wait_until="domcontentloaded")
        
        # 3. Handle Turnstile (Cloudflare) natively using our reusable method
        await bypass_cloudflare(page)
        
        creds = generate_random_credentials()
        print(f"Registering with username: {creds['username']}")
        
        # Fill Registration Form
        try:
            # NOTE: These selectors might need to be adjusted based on the specific site's DOM.
            # E.g. sometimes "Username" label is wrapped differently, or it's named "user_name"
            await page.get_by_label("Username").fill(creds["username"])
            await page.get_by_label("Email").fill(creds["email"])
            await page.get_by_label("Password").fill(creds["password"])
            await page.get_by_label("Verify password").fill(creds["password"])
            print("Filled registration form.")
        except Exception as e:
            print(f"Could not fill form. The elements might not be visible or the layout might be different: {e}")
        
        print("Note: Skipping SolveMedia CAPTCHA. If the site requires it, submission will fail without a solver.")
        
        # Submit
        print("Submitting registration...")
        submit_btn = page.get_by_role("button", name="Join Us|Register|Create Account|Sign Up", exact=False)
        if await submit_btn.count() == 0:
            submit_btn = page.locator("input[type='submit'], button[type='submit']")
            
        if await submit_btn.count() > 0:
            await submit_btn.first.click()
            print("Click submitted.")
        else:
            print("Submit button not found.")
            
        # Wait for result
        await page.wait_for_timeout(5000)
        print("Current URL after submit:", page.url)
        print("Current Title:", await page.title())
        
        # Take a screenshot to verify success
        await page.screenshot(path="result_screenshot.png")
        print("Saved screenshot to result_screenshot.png")
        
    finally:
        # 4. Clean up gracefully
        await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
