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

    async def _solve_recaptcha_v2(self, page: Page) -> bool:
        self.logger.info("Attempting to solve Google reCAPTCHA v2...")
        try:
            # Try to find sitekey from elements
            site_key = None
            grecaptcha_element = page.locator("[data-sitekey]").first
            if await grecaptcha_element.count() > 0:
                site_key = await grecaptcha_element.get_attribute("data-sitekey")
            
            if not site_key:
                # Try to extract from iframe src
                iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
                if await iframe.count() > 0:
                    src = await iframe.get_attribute("src")
                    import urllib.parse as urlparse
                    parsed = urlparse.urlparse(src)
                    site_key = urlparse.parse_qs(parsed.query).get('k', [None])[0]
            
            if not site_key:
                # Default fallback for bookmarks2u
                site_key = "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId"
                
            self.logger.info(f"reCAPTCHA v2 sitekey found: {site_key}")
            
            import asyncio
            def run_2captcha(page_url, sitekey):
                from twocaptcha import TwoCaptcha
                api_key = '20205071fed24f4c1418d43380555585'
                solver = TwoCaptcha(api_key)
                result = solver.recaptcha(sitekey=sitekey, url=page_url)
                return result.get('code', '') if isinstance(result, dict) else ''
                
            loop = asyncio.get_event_loop()
            pred = await loop.run_in_executor(None, run_2captcha, page.url, site_key)
            pred = pred.strip()
            
            if pred:
                self.logger.info("Injecting reCAPTCHA response token...")
                await page.evaluate(f"""(token) => {{
                    const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
                    fields.forEach(el => {{
                        el.value = token;
                        el.innerHTML = token;
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    }});
                    if (typeof ___grecaptcha_cfg !== 'undefined' && ___grecaptcha_cfg.clients) {{
                        for (const client of Object.values(___grecaptcha_cfg.clients)) {{
                            for (const prop of Object.values(client)) {{
                                if (prop && typeof prop.callback === 'function') {{
                                    try {{ prop.callback(token); }} catch(e) {{}}
                                }}
                            }}
                        }}
                    }}
                }}""", pred)
                await page.wait_for_timeout(2000)
                return True
            else:
                self.logger.warning("2captcha returned empty reCAPTCHA token.")
                return False
        except Exception as e:
            self.logger.error(f"Error solving reCAPTCHA v2: {e}")
            return False

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

    async def _solve_captcha(self, page: Page) -> None:
        """Dynamically detect and solve whichever captcha is visible on the page."""
        recaptcha_iframe = page.locator("iframe[src*='recaptcha/api2/anchor']")
        grecaptcha_el = page.locator("[data-sitekey]")
        if await recaptcha_iframe.count() > 0 or await grecaptcha_el.count() > 0:
            await self._solve_recaptcha_v2(page)
            return

        solvemedia_iframe = page.locator("#adcopy-puzzle-image-image iframe")
        solvemedia_img = page.locator("img[src*='solvemedia']")
        if await solvemedia_iframe.count() > 0 or await solvemedia_img.count() > 0:
            await self._solve_captcha_2captcha(page)
            return

        self.logger.warning("No known CAPTCHA elements found on page.")

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
            
            # Fill registration form dynamically based on element existence
            username_field = page.locator("#user_login")
            if await username_field.count() == 0:
                username_field = page.locator("#reg_username")
                
            email_field = page.locator("#user_email")
            if await email_field.count() == 0:
                email_field = page.locator("#reg_email")
                
            password_field = page.locator("#user_password")
            if await password_field.count() == 0:
                password_field = page.locator("#reg_password")
                
            confirm_field = page.locator("#user_cpassword")
            if await confirm_field.count() == 0:
                confirm_field = page.locator("#reg_verify")
                
            await username_field.first.fill(self.credentials["username"])
            await email_field.first.fill(self.credentials["email"])
            await password_field.first.fill(self.credentials["password"])
            await confirm_field.first.fill(self.credentials["password"])
            
            nickname_field = page.locator("#nickname")
            if await nickname_field.count() > 0:
                await nickname_field.first.fill(self.credentials["username"])
                
            await page.wait_for_timeout(1000)

            # Handle Captcha
            await self._solve_captcha(page)

            # Submit registration using the specific submit button locator
            submit_btn = page.locator("input[value='Register'], input[value='Create user'], button:has-text('Create user'), button:has-text('Register'), input[type='submit']")
            await submit_btn.first.click()

            # Wait for registration to complete (success or error)
            await page.wait_for_timeout(4000)
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except:
                pass

            current_url = page.url
            if "/user/" in current_url or "my-articles" in current_url:
                self.logger.info("Registration successful, redirected to dashboard page.")
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
                self.logger.info("Registration completed (assumed success without redirect)")
                break

        self.logger.info("Registration flow finished")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        """Submit the bookmark and return the created story/backlink URL."""
        self.logger.info(f"Bookmark submission started: url={client_site}, keyword={keyword}")

        await page.goto(self.SUBMIT_URL, wait_until="domcontentloaded")
        await self._handle_cloudflare(page)
        await page.wait_for_timeout(1500)

        # Check if we are on a single-step or two-step submission page
        is_single_step = await page.locator("#articleUrl, #submitpro_title").count() > 0
        
        if is_single_step:
            self.logger.info("Detected single-step submission layout.")
            
            # Fill form
            await page.locator("#articleUrl").first.fill(client_site)
            await page.locator("#submitpro_title").first.fill(keyword)
            
            category_select = page.locator("#submitpro_category")
            if await category_select.count() > 0:
                try:
                    await category_select.first.select_option(index=1)
                except:
                    pass
                    
            tags_input = page.locator("#tagsinput")
            if await tags_input.count() > 0:
                await tags_input.first.fill(keyword)
                
            desc_textarea = page.locator("#submitpro_desc")
            if await desc_textarea.count() > 0:
                await desc_textarea.first.fill(f"Valuable insights and resources related to {keyword}. Explore more details at the link.")
                
            agree_checkbox = page.locator("#agree-checkbox")
            if await agree_checkbox.count() > 0:
                await page.evaluate("() => document.getElementById('agree-checkbox').click()")
                
            await page.wait_for_timeout(1000)
            
            # Solve CAPTCHA
            await self._solve_captcha(page)
            
            # Submit
            submit_btn = page.locator("input[value='Preview & Submit'], input[type='submit']").first
            await submit_btn.click()
            
            await page.wait_for_timeout(5000)
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except:
                pass
                
            # Check if there is a preview page that requires final confirmation click
            confirm_btn = page.locator("input[value='Submit'], input[value='Confirm'], button:has-text('Submit')").first
            if await confirm_btn.count() > 0:
                self.logger.info("Confirmation step detected. Clicking final submit...")
                await confirm_btn.click()
                await page.wait_for_timeout(5000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except:
                    pass
        else:
            self.logger.info("Detected standard two-step submission layout.")
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
                await self._solve_captcha(page)

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
            current = page.url
            if "/story" in current or "article" in current:
                backlink_url = current
            else:
                raise Exception("Could not extract backlink URL after submission. Check site changes.")

        self.logger.info(f"Bookmark submitted. Extracted backlink: {backlink_url}")
        return backlink_url

    async def _extract_backlink_url(self, page: Page) -> Optional[str]:
        """
        Try multiple strategies to find the newly created story URL.
        """
        # Strategy 1: Current page URL if it represents a successfully submitted article
        current_url = page.url
        ignored_segments = ["/login", "/register", "/submit", "/dashboard", "/my-articles", "/wp-admin", "/my-account"]
        if not any(seg in current_url for seg in ignored_segments) and len(current_url) > len(self.BASE_URL) + 5:
            return current_url

        # Strategy 2: Look for links containing /story or /articles/ in the page
        try:
            story_links = await page.locator("a[href*='/story'], a[href*='/articles/']").all()
            for link in story_links:
                href = await link.get_attribute("href")
                if href and len(href) > 20:
                    if not href.startswith("http"):
                        href = self.BASE_URL + href if href.startswith("/") else self.BASE_URL + "/" + href
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
                    parent = locator.first.locator("xpath=ancestor::div[1]")
                    link = parent.locator("a[href*='/story'], a[href*='/articles/']").first
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