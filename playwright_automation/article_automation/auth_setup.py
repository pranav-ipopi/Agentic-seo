"""
Authentication Setup Script for Article Automation

Run this script to manually log into platforms (Medium, Reddit, etc.)
It will save the browser context (cookies, local storage) to a JSON file,
which the article_worker.py will reuse.
"""
import asyncio
import os
import json
from playwright.async_api import async_playwright

PROFILES_DIR = os.path.join(os.path.dirname(__file__), "profiles")

async def save_authentication(profile_name: str, urls: list[str]):
    os.makedirs(PROFILES_DIR, exist_ok=True)
    state_path = os.path.join(PROFILES_DIR, f"{profile_name}.json")
    
    print(f"Starting authentication for profile: {profile_name}")
    print(f"Target platforms: {', '.join(urls)}")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        
        # Load existing state if it exists, to append new logins
        context_opts = {"viewport": {"width": 1920, "height": 1080}}
        if os.path.exists(state_path):
            print(f"Loading existing state from {state_path}")
            context_opts["storage_state"] = state_path
            
        context = await browser.new_context(**context_opts)
        page = await context.new_page()
        
        print("\n--- INSTRUCTIONS ---")
        print("A browser window has opened.")
        for i, url in enumerate(urls, 1):
            print(f"[{i}/{len(urls)}] Navigating to {url}")
            try:
                await page.goto(url, wait_until="commit")
                print(">> Please log in manually.")
            except Exception as e:
                print(f"Error navigating: {e}")
            
            # Pause for user interaction
            await asyncio.to_thread(input, "Press ENTER in this console after you have successfully logged in to continue...")
            
        print("\nSaving authentication state...")
        await context.storage_state(path=state_path)
        print(f"Successfully saved authentication state to {state_path}")
        
        await context.close()
        await browser.close()

if __name__ == "__main__":
    try:
        profile = input("Enter a name for this profile (e.g., 'default_author', 'client_x'): ").strip()
        if not profile:
            profile = "default_profile"
            
        print("Which platforms do you want to authenticate? (comma separated)")
        print("Examples: https://medium.com, https://reddit.com, https://wordpress.com")
        platforms_input = input("URLs: ").strip()
        
        if platforms_input:
            urls = [u.strip() for u in platforms_input.split(",") if u.strip()]
        else:
            urls = ["https://medium.com", "https://reddit.com", "https://wordpress.com"]
            
        asyncio.run(save_authentication(profile, urls))
    except KeyboardInterrupt:
        print("\nExiting...")
