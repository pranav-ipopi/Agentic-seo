"""
LiveBookmarking.com Site Template - V1

This is the site-specific implementation for https://livebookmarking.com/

Responsibilities (per spec):
- Navigate site
- Register account if required (generates random credentials)
- Login
- Create bookmark/backlink (submit client_site + keyword)
- Return created backlink URL

Clean interface:
    async def run(self, client_site: str, keyword: str) -> Dict[str, Any]

The returned dict should contain at minimum:
    {
        "backlink_url": "https://livebookmarking.com/storyXXXXX/..." or None,
        "success": bool,
        "message": str
    }

Architecture notes for future sites:
- All future templates MUST implement the exact same `run(client_site, keyword)` signature.
- Site-specific logic (selectors, flows, captcha handling) lives ONLY inside the template.
- No generic strategy pattern in V1 (per requirements: avoid premature abstractions).

Analysis of livebookmarking.com (performed 2026-06-09):
- It is a Pligg-like social news / bookmarking site.
- Public pages show recent stories with user attribution.
- /login : Username/Email + Password form. No captcha visible in text extraction.
- /register : Username, Email, Password, Verify password + SolveMedia CAPTCHA (puzzle).
  CAPTCHA appears as image + "Your Answer" input. Uses solvemedia/adcopy.
- /submit (requires login): Redirects unauthenticated users to /login?return=/submit.
- Submission flow (inferred from similar Pligg sites + site behavior):
  - Title (keyword)
  - URL (client_site)
  - Description (short text with keyword)
  - Tags (keyword)
  - Category (often "News" or first available)
  - Possible captcha on submit (not confirmed in V1 analysis due to auth wall).
- After successful submit, site typically redirects to the new story page
  (e.g. https://livebookmarking.com/story2160XXXX/slugified-title).
- Backlink created = the story URL on livebookmarking.com (points to client_site).

Selectors used (based on label text + common Pligg patterns):
- Heavy use of Playwright's get_by_label / get_by_role for robustness.
- CSS fallbacks for reliability.
- Waits are generous (networkidle + explicit) because site can be slow.

Captcha handling:
- Calls CaptchaService when "CAPTCHA" text or solvemedia elements detected.
- V1: Uses stub (will fail real captchas). See services/captcha_service.py
- Future: Replace stub with real solver. The solve() call returns the answer string
  to fill into the response field (typically name="adcopy_response" for SolveMedia).

Retry / error handling:
- Template raises on unrecoverable errors.
- Worker catches and applies retry logic (max 3).

Assumptions (documented for maintenance):
1. Registration does not require email verification (common for these sites).
2. New accounts can immediately login and submit.
3. Category "News" exists and is selectable (value often "1" or label "News").
4. Submit success can be detected by URL containing /story or success message.
5. No rate limiting / IP blocks in V1 scope (VPS deployment will need proxies later).
6. SolveMedia captcha on register (confirmed). Submit captcha unknown.
7. Usernames must be unique; we append random suffix.
8. Password min 5 chars (per register page).

Future maintenance points:
- If site changes form field names/labels -> update selectors here.
- If new captcha appears on submit -> add detection + solve call.
- When onboarding new sites via AI (future), this template serves as reference for structure.
- Add more robust success detection (e.g. look for "story submitted" text).
- Consider storing successful account credentials for reuse (future optimization, not V1).

No AI / LLM used during execution (per spec).
"""

import asyncio
import sys
import os
import random
import string
import logging

from typing import Dict, Any, Optional
from playwright.async_api import Page, BrowserContext, TimeoutError as PlaywrightTimeoutError

# Add backlink_automation directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.captcha_service import CaptchaService
from methods.stealth_browser import StealthBrowserManager


def _generate_random_credentials() -> Dict[str, str]:
    """Generate random registration credentials for this job."""
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    username = f"backlink{suffix}"
    email = f"{username}@mailinator.com"  # Disposable-style; adjust if site blocks
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    return {
        "username": username,
        "email": email,
        "password": password
    }


class LiveBookmarkingTemplate:
    """
    Implementation of the LiveBookmarking submission process.
    Handles:
    - Cloudflare Turnstile bypass natively
    - Account Registration via Mailinator / dynamic forms
    - Solving Captcha (SolveMedia via TrOCR local model)
    - Submitting bookmark and returning the URL
    """

    BASE_URL = "https://livebookmarking.com"
    REGISTER_URL = f"{BASE_URL}/register"
    SUBMIT_URL = f"{BASE_URL}/submit"

    # We do NOT use camoufox or playwright intercept anymore. 
    # SeleniumBase CDP natively handles the stealth!

    def __init__(
        self,
        browser_manager: StealthBrowserManager,
        captcha_service: CaptchaService,
        logger: logging.Logger
    ):
        self.browser_manager = browser_manager
        self.captcha_service = captcha_service
        self.logger = logger
        self.credentials: Optional[Dict[str, str]] = None

    async def run(self, client_site: str, keyword: str) -> Dict[str, Any]:
        """
        Main entry point. Executes the full backlink creation flow.
        """
        self.logger.info(f"Starting LiveBookmarkingTemplate for client_site={client_site}, keyword={keyword}")

        try:
            page = await self.browser_manager.get_page()

            # Step 1: Go to home / check state
            await self._navigate_home(page)

            # Step 2: Ensure we are logged in (register + login if needed)
            await self._ensure_logged_in(page)

            # Step 3: Create the bookmark / backlink
            backlink_url = await self._submit_bookmark(page, client_site, keyword)

            self.logger.info(f"Successfully created backlink: {backlink_url}")
            return {
                "backlink_url": backlink_url,
                "success": True,
                "message": "Bookmark submitted successfully"
            }

        except PlaywrightTimeoutError as e:
            self.logger.error(f"Timeout during automation: {e}")
            raise Exception(f"Timeout: {str(e)}") from e
        except Exception as e:
            self.logger.error(f"Automation failed: {e}")
            raise

    async def _navigate_home(self, page: Page) -> None:
        """Navigate to home page and wait for load."""
        self.logger.info("Navigating to home page")
        await page.goto(self.BASE_URL, wait_until="domcontentloaded")
        await self._handle_cloudflare(page)
        await page.wait_for_timeout(1500)

    async def _ensure_logged_in(self, page: Page) -> None:
        """
        Register a new account if we are not logged in.
        After registration, we are usually auto-logged in.
        If not, perform explicit login.
        """
        # Quick check: look for elements that indicate logged-in state
        # (e.g. logout link, submit link, or user menu). For V1 we use simple heuristic.
        logged_in = await self._is_logged_in(page)
        if logged_in:
            self.logger.info("Already logged in (detected)")
            return

        self.logger.info("Not logged in. Starting registration flow.")
        await self._register_account(page)
        # We skip explicit login page as the user will be logged in after registration

    async def _is_logged_in(self, page: Page) -> bool:
        """Heuristic to detect logged-in state."""
        try:
            # Look for common logged-in indicators on this site
            # (user profile links, logout, or the submit button being visible without redirect)
            logout_text = ["logout", "sign out", "log out"]
            for text in logout_text:
                if await page.get_by_text(text, exact=False).count() > 0:
                    return True

            # DO NOT go to SUBMIT_URL here as it triggers unnecessary Cloudflare challenges.
            # Instead, if we don't see logout buttons, we assume we aren't logged in.
            return False
        except Exception:
            return False

    async def _handle_cloudflare(self, page: Page) -> bool:
        """Delegates Cloudflare bypassing to our new reusable methods."""
        from methods.cloudflare import bypass_cloudflare
        return await bypass_cloudflare(page)

    async def _solve_captcha_2captcha(self, page: Page) -> None:
        self.logger.info("Attempting to solve SolveMedia captcha with 2captcha...")
        try:
            # 1. Target the iframe wrapper container
            captcha_frame = page.frame_locator("#adcopy-puzzle-image-image iframe")
            
            # 2. Locate the direct <img> element inside that iframe body
            captcha_img = captcha_frame.locator("img").first

            # Fallback to direct page element if needed
            if await captcha_img.count() == 0:
                captcha_img = page.locator("img[src*='solvemedia']").first

            if await captcha_img.count() > 0:
                # Save the image locally
                img_path = "solvemedia_captcha.png"
                await captcha_img.screenshot(path=img_path)
                
                # 3. Use twocaptcha for solving
                import asyncio
                
                def run_2captcha(image_path):
                    from twocaptcha import TwoCaptcha
                    api_key = '20205071fed24f4c1418d43380555585'
                    solver = TwoCaptcha(api_key)
                    # For solvemedia or normal image captchas
                    result = solver.normal(image_path)
                    return result.get('code', '') if isinstance(result, dict) else ''
                
                # Run network request outside the browser event thread
                loop = asyncio.get_event_loop()
                self.logger.info("Sending image to 2captcha service...")
                pred = await loop.run_in_executor(None, run_2captcha, img_path)
                
                pred = pred.strip()
                self.logger.info(f"2captcha predicted: '{pred}'")
                
                if pred:
                    # 4. Fill the input field box on the main parent page layout
                    response_field = page.locator("#adcopy_response")
                    await response_field.fill(pred)
                    
                    # Small wait to ensure characters register natively before hitting submit buttons
                    await page.wait_for_timeout(1000)
                else:
                    self.logger.warning("2captcha returned empty result.")
            else:
                self.logger.warning("SolveMedia image element could not be found inside the target layout frame.")
        except ImportError:
            self.logger.error("twocaptcha is not installed. Run: pip install 2captcha-python")
        except Exception as e:
            self.logger.error(f"Error solving captcha with 2captcha: {e}")

    async def _register_account(self, page: Page) -> None:
        """Perform registration with generated credentials."""
        self.credentials = _generate_random_credentials()
        self.logger.info(f"Registration started with username={self.credentials['username']}")

        await page.goto(self.REGISTER_URL, wait_until="domcontentloaded")
        await self._handle_cloudflare(page)
        await page.wait_for_timeout(1500)

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info(f"Registration attempt {attempt + 1}/{max_retries}")
            
            # Fill registration form using exact IDs
            await page.locator("#reg_username").fill(self.credentials["username"])
            await page.locator("#reg_email").fill(self.credentials["email"])
            await page.locator("#reg_password").fill(self.credentials["password"])
            await page.locator("#reg_verify").fill(self.credentials["password"])

            # Handle Captcha
            await self._solve_captcha_2captcha(page)

            # Submit registration using the specific submit button locator
            submit_btn = page.locator("input.btn.btn-primary.reg_submit[value='Create user']")
            if await submit_btn.count() == 0:
                submit_btn = page.locator("input[value='Create user'], button:has-text('Create user'), input[type='submit']")
            await submit_btn.first.click()

            # Wait for registration to complete (success or error)
            await page.wait_for_timeout(4000)
            await page.wait_for_load_state("networkidle", timeout=30000)

            current_url = page.url
            if "/user/" in current_url:
                self.logger.info("Registration successful, redirected to user page.")
                break

            # Check for success indicators (no error messages, or redirect)
            body_text = (await page.inner_text("body")).lower()
            if "invalid captcha" in body_text or ("captcha" in body_text and "invalid" in body_text) or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha detected. Retrying...")
                continue
            elif "error" in body_text or "already" in body_text:
                self.logger.warning("Possible registration error or duplicate. Proceeding anyway.")
                break
            else:
                self.logger.info("Registration completed (assumed success without /user/ redirect)")
                break

        self.logger.info("Registration flow finished")



    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        """Submit the bookmark and return the created story/backlink URL."""
        self.logger.info(f"Bookmark submission started: url={client_site}, keyword={keyword}")

        await page.goto(self.SUBMIT_URL, wait_until="domcontentloaded")
        await self._handle_cloudflare(page)
        await page.wait_for_timeout(1500)

        # Step 1: Submit URL
        self.logger.info("Step 1: Submitting URL")
        url_field = page.locator("#url")
        if await url_field.count() == 0:
            url_field = page.locator("input[name='url'], input[name*='story_url'], input[type='url']")
        await url_field.first.fill(client_site)

        continue_btn = page.locator("input[value='Continue'], button:has-text('Continue')")
        if await continue_btn.count() == 0:
            continue_btn = page.locator("input[type='submit'], button[type='submit']")
        await continue_btn.first.click()

        await page.wait_for_load_state("domcontentloaded")
        await page.wait_for_timeout(2000)

        # Step 2: Article Details
        self.logger.info("Step 2: Filling Article Details")
        
        max_retries = 3
        for attempt in range(max_retries):
            # Story title id (keyword) = title
            await page.locator("#title").fill(keyword)

            # Tags id (keyword specific tags)= tags
            await page.locator("#tags").fill(keyword)

            # Description id (here we add description) = bodytext
            await page.locator("#bodytext").fill(f"Resource related to {keyword}. Automated bookmark submission.")

            # Category - Try selecting first option if present
            category_select = page.locator("select[name='category'], select[name='cat'], #category, select")
            if await category_select.count() > 0:
                try:
                    await category_select.first.select_option(index=1)
                except Exception:
                    pass

            # Handle Captcha
            self.logger.info(f"Solving captcha on submit page... (Attempt {attempt + 1}/{max_retries})")
            await self._solve_captcha_2captcha(page)

            # Submit the form: Save Changes and Submit
            submit_btn = page.locator("input[value='Save Changes and Submit'], button:has-text('Save Changes and Submit')")
            if await submit_btn.count() == 0:
                submit_btn = page.locator("input[type='submit'], button[type='submit'], .submit")

            await submit_btn.first.click()

            self.logger.info("Bookmark form submitted. Waiting for result...")

            # Wait for navigation or success indication
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
                await page.wait_for_timeout(3000)
            except PlaywrightTimeoutError:
                self.logger.warning("Timeout waiting for submit result...")

            body_text = (await page.inner_text("body")).lower()
            if "invalid captcha" in body_text or ("captcha" in body_text and "invalid" in body_text) or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha detected on submit. Retrying...")
                continue
            else:
                break

        # Extract the created backlink URL
        backlink_url = await self._extract_backlink_url(page)
        if not backlink_url:
            # Fallback: current URL if it looks like a story
            current = page.url
            if "/story" in current:
                backlink_url = current
            else:
                raise Exception("Could not extract backlink URL after submission. Check site changes.")

        self.logger.info(f"Bookmark submitted. Extracted backlink: {backlink_url}")
        return backlink_url

    async def _extract_backlink_url(self, page: Page) -> Optional[str]:
        """
        Try multiple strategies to find the newly created story URL.
        """
        # Strategy 1: Current page URL
        current_url = page.url
        if "/story" in current_url and "login" not in current_url:
            return current_url

        # Strategy 2: Look for links containing /story in the page
        try:
            story_links = await page.locator("a[href*='/story']").all()
            for link in story_links:
                href = await link.get_attribute("href")
                if href and "/story" in href and len(href) > 20:
                    if not href.startswith("http"):
                        href = self.BASE_URL + href if href.startswith("/") else self.BASE_URL + "/" + href
                    # Avoid comment/discuss links
                    if "#discuss" not in href and "#comments" not in href:
                        return href
        except Exception:
            pass

        # Strategy 3: Look for success text and nearby link
        try:
            success_texts = ["submitted", "success", "published", "your story"]
            for text in success_texts:
                locator = page.get_by_text(text, exact=False)
                if await locator.count() > 0:
                    # Look for nearby story link
                    parent = locator.first.locator("xpath=ancestor::div[1]")
                    link = parent.locator("a[href*='/story']").first
                    if await link.count() > 0:
                        href = await link.get_attribute("href")
                        if href:
                            if not href.startswith("http"):
                                href = self.BASE_URL + (href if href.startswith("/") else "/" + href)
                            return href
        except Exception:
            pass

        return None

    # Optional helper for future: logout if needed
    async def _logout(self, page: Page) -> None:
        try:
            logout = page.get_by_text("logout", exact=False).first
            if await logout.count() > 0:
                await logout.click()
        except Exception:
            pass