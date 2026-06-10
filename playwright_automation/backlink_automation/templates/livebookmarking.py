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
import random
import string
import os
import logging

from typing import Dict, Any, Optional
from playwright.async_api import Page, BrowserContext, TimeoutError as PlaywrightTimeoutError

from services.captcha_service import CaptchaService
from playwright_local.browser import BrowserManager


def _generate_random_credentials() -> Dict[str, str]:
    """Generate random registration credentials for this job."""
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    username = f"backlink_{suffix}"
    email = f"{username}@mailinator.com"  # Disposable-style; adjust if site blocks
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    return {
        "username": username,
        "email": email,
        "password": password
    }


class LiveBookmarkingTemplate:
    """Site template for https://livebookmarking.com/"""

    BASE_URL = "https://livebookmarking.com"
    REGISTER_URL = f"{BASE_URL}/register"
    LOGIN_URL = f"{BASE_URL}/login"
    SUBMIT_URL = f"{BASE_URL}/submit"

    INTERCEPT_SCRIPT = "" # Removed as we use programmatic clicking now

    def __init__(
        self,
        browser_manager: BrowserManager,
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

        # Re-check after registration
        await page.wait_for_timeout(2000)
        logged_in = await self._is_logged_in(page)
        if not logged_in:
            self.logger.info("Not auto-logged after register. Performing explicit login.")
            await self._login(page)

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

    async def _register_account(self, page: Page) -> None:
        """Perform registration with generated credentials."""
        self.credentials = _generate_random_credentials()
        self.logger.info(f"Registration started with username={self.credentials['username']}")

        await page.goto(self.REGISTER_URL, wait_until="domcontentloaded")
        await self._handle_cloudflare(page)
        await page.wait_for_timeout(1500)

        # Fill registration form using exact IDs
        await page.locator("#reg_username").fill(self.credentials["username"])
        await page.locator("#reg_email").fill(self.credentials["email"])
        await page.locator("#reg_password").fill(self.credentials["password"])
        await page.locator("#reg_verify").fill(self.credentials["password"])

        # Handle Captcha using ddddocr (Pre-trained local model)
        self.logger.info("Attempting to solve SolveMedia captcha with ddddocr...")
        try:
            # 1. Locate the captcha image
            captcha_img = page.locator("img[src*='solvemedia']")
            if await captcha_img.count() > 0:
                # 2. Save it locally
                img_path = "solvemedia_captcha.png"
                await captcha_img.first.screenshot(path=img_path)
                
                # 3. Use Hugging Face TrOCR for offline, local solving (handles words and spaces)
                from transformers import TrOCRProcessor, VisionEncoderDecoderModel
                from PIL import Image
                import asyncio
                
                self.logger.info("Loading TrOCR model (anuashok/ocr-captcha-v3) - this may take a moment...")
                
                # We define a synchronous helper function to run the model
                def run_trocr(image_path):
                    model_name = "anuashok/ocr-captcha-v3"
                    processor = TrOCRProcessor.from_pretrained(model_name)
                    model = VisionEncoderDecoderModel.from_pretrained(model_name)
                    image = Image.open(image_path).convert("RGB")
                    pixel_values = processor(images=image, return_tensors="pt").pixel_values
                    generated_ids = model.generate(pixel_values)
                    return processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
                
                # Run the heavy model inference in an executor so we don't freeze the Playwright event loop
                loop = asyncio.get_event_loop()
                pred = await loop.run_in_executor(None, run_trocr, img_path)
                
                self.logger.info(f"TrOCR predicted: {pred}")
                
                # 4. Fill the response box
                await page.locator("#adcopy_response").fill(pred)
            else:
                self.logger.warning("SolveMedia image not found on page.")
        except ImportError:
            self.logger.error("transformers is not installed. Run: pip install transformers torch torchvision pillow")
        except Exception as e:
            self.logger.error(f"Error solving captcha with TrOCR: {e}")

        # Submit registration using the specific submit button locator
        submit_btn = page.locator("input.btn.btn-primary.reg_submit[value='Create user']")
        await submit_btn.first.click()

        # Wait for registration to complete (success or error)
        await page.wait_for_timeout(4000)
        await page.wait_for_load_state("networkidle", timeout=30000)

        # Check for success indicators (no error messages, or redirect)
        body_text = (await page.inner_text("body")).lower()
        if "error" in body_text or "already" in body_text or "invalid" in body_text:
            # Could be duplicate username etc. Rare with random suffix.
            self.logger.warning("Possible registration error or duplicate. Proceeding anyway.")
        else:
            self.logger.info("Registration completed (assumed success)")

        # Many sites auto-login after register
        self.logger.info("Registration flow finished")

    async def _login(self, page: Page) -> None:
        """Login using previously generated (or provided) credentials."""
        if not self.credentials:
            raise Exception("No credentials available for login. Registration must precede login.")

        self.logger.info("Login started")

        await page.goto(self.LOGIN_URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        # Fill login form (labels from site analysis)
        await page.get_by_label("Username/Email").fill(self.credentials["username"])
        await page.get_by_label("Password").fill(self.credentials["password"])

        # Remember me (optional)
        remember = page.get_by_label("Remember", exact=False)
        if await remember.count() > 0:
            await remember.check()

        # Submit
        login_btn = page.get_by_role("button", name="Login|Sign In|Log In", exact=False)
        if await login_btn.count() == 0:
            login_btn = page.locator("input[type='submit'], button[type='submit']")

        await login_btn.first.click()

        await page.wait_for_timeout(3000)
        await page.wait_for_load_state("networkidle", timeout=30000)

        # Verify login success
        if await self._is_logged_in(page):
            self.logger.info("Login completed successfully")
        else:
            raise Exception("Login failed - could not confirm logged-in state")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        """Submit the bookmark and return the created story/backlink URL."""
        self.logger.info(f"Bookmark submission started: url={client_site}, keyword={keyword}")

        await page.goto(self.SUBMIT_URL, wait_until="domcontentloaded")
        await self._handle_cloudflare(page)
        await page.wait_for_timeout(1500)

        # Fill submission form (assumed Pligg-style fields + labels)
        # Title
        title_field = page.get_by_label("Title", exact=False)
        if await title_field.count() == 0:
            title_field = page.locator("input[name='title'], input[name*='story_title'], #title")
        await title_field.first.fill(keyword)

        # URL (the client site being bookmarked)
        url_field = page.get_by_label("URL", exact=False)
        if await url_field.count() == 0:
            url_field = page.locator("input[name='url'], input[name*='story_url'], #url, input[type='url']")
        await url_field.first.fill(client_site)

        # Description (short text)
        desc_field = page.get_by_label("Description", exact=False)
        if await desc_field.count() == 0:
            desc_field = page.locator("textarea[name='description'], textarea[name*='story'], #description")
        await desc_field.first.fill(f"Resource related to {keyword}. Automated bookmark submission.")

        # Tags
        tags_field = page.get_by_label("Tags", exact=False)
        if await tags_field.count() == 0:
            tags_field = page.locator("input[name='tags'], input[name*='tag'], #tags")
        await tags_field.first.fill(keyword)

        # Category - try to select "News" or first option
        category_select = page.locator("select[name='category'], select[name='cat'], #category, select")
        if await category_select.count() > 0:
            try:
                # Try label "News" first
                await category_select.first.select_option(label="News")
            except Exception:
                try:
                    await category_select.first.select_option(index=1)  # skip "Select..."
                except Exception:
                    self.logger.warning("Could not select category, proceeding without")

        # Handle captcha on submit page if present
        if await self.captcha_service.is_captcha_present(page):
            self.logger.info("Captcha detected on submit page")
            answer = await self.captcha_service.solve(page=page, captcha_type="unknown")
            if answer:
                captcha_input = page.locator(
                    "input[name='adcopy_response'], input[name*='captcha'], input[placeholder*='answer']"
                )
                if await captcha_input.count() > 0:
                    await captcha_input.first.fill(answer)
                    self.logger.info("Filled submit captcha (stub)")

        # Submit the form
        submit_btn = page.get_by_role("button", name="Submit|Submit Story|Post|Save", exact=False)
        if await submit_btn.count() == 0:
            submit_btn = page.locator("input[type='submit'], button[type='submit'], .submit")

        await submit_btn.first.click()

        self.logger.info("Bookmark form submitted. Waiting for result...")

        # Wait for navigation or success indication
        try:
            await page.wait_for_load_state("networkidle", timeout=45000)
            await page.wait_for_timeout(3000)
        except PlaywrightTimeoutError:
            self.logger.warning("Timeout waiting for submit result, attempting to extract URL anyway")

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
        # Strategy 1: Look for links containing /story in the page
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

        # Strategy 2: Current page URL
        current_url = page.url
        if "/story" in current_url and "login" not in current_url:
            return current_url

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