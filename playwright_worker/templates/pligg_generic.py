"""
Generic Pligg/Kliqqi CMS Site Template (Config-Driven)

This is a universal implementation that works for the vast majority of Pligg-based
social bookmarking sites. All selectors are read from the merged config, so individual
sites can override any selector without modifying this template code.

Responsibilities:
- Accept any Pligg site URL
- Navigate site
- Register account (generates random credentials)
- Create bookmark/backlink (submit client_site + keyword)
- Return created backlink URL

Config file: configs/templates/pligg.json
Site overrides: configs/sites/{target_site_uuid}.json
"""

import asyncio
import random
import logging

from typing import Dict, Any, Optional
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from templates.base_template import BaseTemplate
from methods.stealth_browser import handle_cloudflare_challenge
from executor.errors import (
    SelectorNotFoundError,
    RegistrationFailedError,
    SubmissionFailedError,
    CaptchaFailedError
)


class PliggGenericTemplate(BaseTemplate):
    """
    Generic Pligg/Kliqqi submission template.
    Handles:
    - Cloudflare Turnstile bypass natively
    - Account Registration via Mailinator / dynamic forms
    - Solving SolveMedia Captcha using 2Captcha
    - Submitting bookmark and returning the URL

    All selectors are read from self.config (merged template + site override).
    """

    def __init__(
        self,
        target_url: str,
        captcha_service,
        logger: logging.Logger,
        config: Dict[str, Any]
    ):
        super().__init__(target_url, captcha_service, logger, config)

        # Build URLs from config paths
        register_path = self.get_config("registration", "register_path", "/register")
        submit_path = self.get_config("submission", "submit_path", "/submit")
        self.REGISTER_URL = f"{self.BASE_URL}{register_path}"
        self.SUBMIT_URL = f"{self.BASE_URL}{submit_path}"

    async def run(self, page: Page, client_site: str, keyword: str) -> Dict[str, Any]:
        """
        Main entry point. Executes the full backlink creation flow.
        """
        self.logger.info(
            f"Starting PliggGenericTemplate on {self.BASE_URL} "
            f"for client_site={client_site}, keyword={keyword}"
        )

        # Step 1: Navigate home
        await self._navigate_home(page)

        # Step 2: Ensure logged in (register if needed)
        await self._ensure_logged_in(page)

        # Step 3: Submit the bookmark
        backlink_url = await self._submit_bookmark(page, client_site, keyword)

        # Step 4: Logout
        await self._logout(page)

        self.logger.info(f"Successfully created backlink: {backlink_url}")
        return {
            "backlink_url": backlink_url,
            "success": True,
            "message": "Bookmark submitted successfully"
        }

    async def _navigate_home(self, page: Page) -> None:
        """Navigate to home page with retry logic and Cloudflare bypass."""
        self.logger.info("Navigating to home page")
        await self.safe_goto(page, self.BASE_URL)
        cf_cleared = await handle_cloudflare_challenge(page)
        if not cf_cleared:
            raise Exception("Cloudflare challenge could not be cleared on home page")
        await page.wait_for_timeout(1500)

    async def _ensure_logged_in(self, page: Page) -> None:
        """Register a new account if not logged in."""
        logged_in = await self._is_logged_in(page)
        if logged_in:
            self.logger.info("Already logged in (detected)")
            return

        self.logger.info("Not logged in. Starting registration flow.")
        await self._register_account(page)

    async def _solve_captcha_2captcha(self, page: Page) -> None:
        """Solve SolveMedia captcha using 2Captcha service. All selectors from config."""
        self.logger.info("Attempting to solve SolveMedia captcha with 2captcha...")

        iframe_sel = self.get_selector("captcha", "iframe_selector",
                                       "#adcopy-puzzle-image-image iframe")
        image_fallback_sel = self.get_selector("captcha", "image_fallback",
                                               "img[src*='solvemedia']")
        response_field_sel = self.get_selector("captcha", "response_field",
                                               "#adcopy_response")

        try:
            # 1. Target the iframe wrapper container
            captcha_frame = page.frame_locator(iframe_sel)

            # 2. Locate the direct <img> element inside that iframe body
            captcha_img = captcha_frame.locator("img").first

            # Fallback to direct page element if needed
            if await captcha_img.count() == 0:
                captcha_img = page.locator(image_fallback_sel).first

            if await captcha_img.count() > 0:
                import uuid
                import os
                # Save the image locally with a unique name to avoid concurrency issues
                unique_id = uuid.uuid4().hex
                img_path = f"solvemedia_captcha_{unique_id}.png"
                await captcha_img.screenshot(path=img_path)

                # 3. Use twocaptcha for solving
                def run_2captcha(image_path):
                    from twocaptcha import TwoCaptcha
                    api_key = os.environ.get('TWOCAPTCHA_API_KEY', '20205071fed24f4c1418d43380555585') # Fallback to existing if not set
                    solver = TwoCaptcha(api_key)
                    return solver.normal(image_path)

                # Run network request outside the browser event thread
                loop = asyncio.get_event_loop()
                self.logger.info("Sending image to 2captcha service...")
                
                try:
                    result = await loop.run_in_executor(None, run_2captcha, img_path)
                finally:
                    # Clean up the file after sending
                    if os.path.exists(img_path):
                        try:
                            os.remove(img_path)
                        except Exception as cleanup_err:
                            self.logger.warning(f"Could not remove temporary captcha file {img_path}: {cleanup_err}")

                if isinstance(result, dict):
                    pred = result.get('code', '').strip()
                    self.last_captcha_id = result.get('captchaId')
                else:
                    pred = str(result).strip()
                    self.last_captcha_id = None
                self.logger.info(f"2captcha predicted: '{pred}'")

                if pred:
                    # 4. Fill the response field
                    response_field = page.locator(response_field_sel)
                    await response_field.fill("")
                    await response_field.press_sequentially(pred, delay=random.randint(50, 150))
                    await page.wait_for_timeout(1000)
                else:
                    self.logger.warning("2captcha returned empty result.")
            else:
                self.logger.warning("SolveMedia image element could not be found.")
        except ImportError:
            self.logger.error("twocaptcha is not installed. Run: pip install 2captcha-python")
        except Exception as e:
            self.logger.error(f"Error solving captcha with 2captcha: {e}")

    async def _report_bad_captcha(self) -> None:
        """Report incorrect captcha solution to 2Captcha."""
        if getattr(self, 'last_captcha_id', None):
            self.logger.info(f"Reporting incorrect captcha solution for ID: {self.last_captcha_id}")
            def run_report(captcha_id):
                from twocaptcha import TwoCaptcha
                import os
                api_key = os.environ.get('TWOCAPTCHA_API_KEY', '20205071fed24f4c1418d43380555585')
                solver = TwoCaptcha(api_key)
                try:
                    solver.report(captcha_id, False)
                except Exception as err:
                    self.logger.warning(f"Failed to report bad captcha to 2captcha: {err}")
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, run_report, self.last_captcha_id)
            self.last_captcha_id = None

    async def _register_account(self, page: Page) -> None:
        """Perform registration with generated credentials. All selectors from config."""
        self.credentials = self.generate_random_credentials()
        self.logger.info(f"Registration started with username={self.credentials['username']}")

        # Read selectors from config
        username_sel = self.get_selector("registration", "username_field", "#reg_username")
        email_sel = self.get_selector("registration", "email_field", "#reg_email")
        password_sel = self.get_selector("registration", "password_field", "#reg_password")
        verify_sel = self.get_selector("registration", "verify_field", "#reg_verify")
        submit_sel = self.get_selector("registration", "submit_button",
                                       "input.btn.btn-primary.reg_submit[value='Create user']")
        submit_fallback = self.get_selector("registration", "submit_button_fallback",
                                            "input[value='Create user'], button:has-text('Create user'), input[type='submit']")

        await self.safe_goto(page, self.REGISTER_URL)
        cf_cleared = await handle_cloudflare_challenge(page)
        if not cf_cleared:
            raise Exception("Cloudflare challenge could not be cleared on registration page")

        # Wait for the form to become fully interactive.
        # Cloudflare can fire a second challenge after the initial page load when it
        # suspects bot activity — this networkidle wait + second CF check ensures any
        # re-trigger is resolved before we touch the form fields.
        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass  # networkidle is best-effort; continue regardless
        cf_cleared = await handle_cloudflare_challenge(page)
        if not cf_cleared:
            raise Exception("Secondary Cloudflare challenge could not be cleared on registration page")

        # Now safe to interact with the form
        await page.wait_for_selector(username_sel, timeout=45000)

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info(f"Registration attempt {attempt + 1}/{max_retries}")

            if attempt == 0:
                # Fill registration form
                await page.locator(username_sel).fill("")
                await page.locator(username_sel).press_sequentially(
                    self.credentials["username"], delay=random.randint(50, 150))
                await asyncio.sleep(random.uniform(0.5, 2.0))

                await page.locator(email_sel).fill("")
                await page.locator(email_sel).press_sequentially(
                    self.credentials["email"], delay=random.randint(50, 150))
                await asyncio.sleep(random.uniform(0.5, 2.0))

                await page.locator(password_sel).fill("")
                await page.locator(password_sel).press_sequentially(
                    self.credentials["password"], delay=random.randint(50, 150))
                await asyncio.sleep(random.uniform(0.5, 2.0))

                await page.locator(verify_sel).fill("")
                await page.locator(verify_sel).press_sequentially(
                    self.credentials["password"], delay=random.randint(50, 150))
                await asyncio.sleep(random.uniform(0.5, 2.0))
            else:
                # On retry, check if password fields got cleared
                if await page.locator(password_sel).count() > 0 and await page.locator(password_sel).input_value() == "":
                    await page.locator(password_sel).fill("")
                    await page.locator(password_sel).press_sequentially(
                        self.credentials["password"], delay=random.randint(50, 150))
                    await asyncio.sleep(random.uniform(0.5, 2.0))
                if await page.locator(verify_sel).count() > 0 and await page.locator(verify_sel).input_value() == "":
                    await page.locator(verify_sel).fill("")
                    await page.locator(verify_sel).press_sequentially(
                        self.credentials["password"], delay=random.randint(50, 150))
                    await asyncio.sleep(random.uniform(0.5, 2.0))

            # Handle Captcha
            await self._solve_captcha_2captcha(page)

            # Submit registration
            submit_btn = page.locator(f"{submit_sel}, {submit_fallback}")
            await submit_btn.first.click()

            # Wait for registration to complete
            await page.wait_for_timeout(4000)
            await page.wait_for_load_state("networkidle", timeout=40000)

            current_url = page.url
            if "/user/" in current_url:
                self.logger.info("Registration successful, redirected to user page.")
                break

            try:
                body_text = (await page.inner_text("body", timeout=15000)).lower()
            except PlaywrightTimeoutError:
                self.logger.warning("Timeout getting body text during registration. Refreshing...")
                try:
                    await page.reload(wait_until="domcontentloaded", timeout=30000)
                    body_text = (await page.inner_text("body", timeout=15000)).lower()
                except Exception as e:
                    self.logger.warning(f"Refresh also failed: {e}")
                    body_text = ""
            if "invalid captcha" in body_text or (
                "captcha" in body_text and "invalid" in body_text
            ) or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha detected. Retrying...")
                await self._report_bad_captcha()
                if attempt == max_retries - 1:
                    raise CaptchaFailedError(
                        message="Max retries exceeded due to persistent invalid captcha on registration.",
                        step="register",
                        url=self.REGISTER_URL
                    )
                continue
            elif "error" in body_text or "already" in body_text:
                self.logger.warning("Possible registration error or duplicate. Proceeding anyway.")
                break
            else:
                self.logger.info(
                    "Registration completed (assumed success without /user/ redirect). "
                    "Verifying login state..."
                )
                # Under concurrent load the /user/ redirect can be slow.
                # Give the page extra time then confirm we are actually authenticated
                # before proceeding — avoids the submit page silently redirecting to login.
                await page.wait_for_timeout(2000)
                if not await self._is_logged_in(page):
                    # Check if we are on a login screen
                    _current_url = page.url.lower()
                    if "login" in _current_url or await page.locator("input[name='username']").count() > 0:
                        self.logger.info("Redirected to login page. Attempting manual login...")
                        try:
                            # Fill username
                            user_field = page.locator("input[name='username']").first
                            if await user_field.count() > 0:
                                await user_field.fill(self.credentials["username"])
                            
                            # Fill password
                            pass_field = page.locator("input[name='password']").first
                            if await pass_field.count() > 0:
                                await pass_field.fill(self.credentials["password"])
                            
                            # Submit
                            login_btn = page.locator("input[type='submit'][value='Sign In'], button:has-text('Sign In'), input[name='processlogin']").first
                            if await login_btn.count() > 0:
                                await login_btn.click()
                                await page.wait_for_load_state("networkidle", timeout=15000)
                                await page.wait_for_timeout(2000)
                                
                                # Verify again
                                if await self._is_logged_in(page):
                                    self.logger.info("Manual login successful.")
                                    break
                        except Exception as e:
                            self.logger.warning(f"Manual login attempt failed: {e}")

                    self.logger.warning(
                        "Assumed-success registration but login state not confirmed. "
                        "Session not authenticated — treating as failure."
                    )
                    
                    if attempt == max_retries - 1:
                        raise RegistrationFailedError(
                            message="Registration appeared to succeed but session could not be verified.",
                            step="register",
                            url=self.REGISTER_URL
                        )
                    else:
                        self.logger.info("Retrying registration from scratch...")
                        continue
                else:
                    break

        self.logger.info("Registration flow finished")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        """Submit the bookmark and return the created story/backlink URL. All selectors from config."""
        self.logger.info(f"Bookmark submission started: url={client_site}, keyword={keyword}")

        # Read selectors from config
        url_sel = self.get_selector("submission", "url_field", "#url")
        url_fallback = self.get_selector("submission", "url_field_fallback",
                                         "input[name='url'], input[name*='story_url'], input[type='url']")
        continue_sel = self.get_selector("submission", "continue_button",
                                         "input[value='Continue'], button:has-text('Continue')")
        continue_fallback = self.get_selector("submission", "continue_button_fallback",
                                              "input[type='submit'], button[type='submit']")
        title_sel = self.get_selector("submission", "title_field", "#title")
        title_fallback = self.get_selector("submission", "title_field_fallback", "input[name='title']")
        tags_sel = self.get_selector("submission", "tags_field", "#tags")
        tags_fallback = self.get_selector("submission", "tags_field_fallback", "input[name='tags']")
        body_sel = self.get_selector("submission", "body_field", "#bodytext")
        body_fallback = self.get_selector("submission", "body_field_fallback", "textarea[name='bodytext'], textarea[name='description']")
        category_sel = self.get_selector("submission", "category_select",
                                         "select[name='category'], select[name='cat'], #category, select")
        submit_sel = self.get_selector("submission", "submit_button",
                                       "input[value='Save Changes and Submit'], button:has-text('Save Changes and Submit')")
        submit_fallback = self.get_selector("submission", "submit_button_fallback",
                                            "input[type='submit'], button[type='submit'], .submit")

        # Get description templates from config
        desc_templates = self.config.get("description_templates", [
            "Resource related to {keyword}. Automated bookmark submission."
        ])
        description_text = random.choice(desc_templates).format(keyword=keyword)

        await self.safe_goto(page, self.SUBMIT_URL)
        cf_cleared = await handle_cloudflare_challenge(page)
        if not cf_cleared:
            raise Exception("Cloudflare challenge could not be cleared on submit page")

        # Guard: if the site redirected us to login/register, the session was not
        # authenticated. Raise immediately instead of timing out 30s on a missing URL field.
        _current_url = page.url.lower()
        if any(p in _current_url for p in ("/login", "/register", "sign-in", "signin")):
            raise RegistrationFailedError(
                message=(
                    f"Submit page redirected to login ({page.url}). "
                    f"Session was not authenticated after registration."
                ),
                step="submit_bookmark",
                url=self.BASE_URL
            )

        await page.wait_for_selector(f"{url_sel}, {url_fallback}", timeout=45000)

        # Step 1: Submit URL
        self.logger.info("Step 1: Submitting URL")
        url_field = page.locator(f"{url_sel}, {url_fallback}")
        await url_field.first.fill("")
        await url_field.first.press_sequentially(client_site, delay=random.randint(50, 150))
        await asyncio.sleep(random.uniform(0.5, 2.0))

        continue_btn = page.locator(f"{continue_sel}, {continue_fallback}")
        await continue_btn.first.click()

        await page.wait_for_load_state("domcontentloaded")
        await page.wait_for_timeout(2000)

        # Step 2: Article Details
        self.logger.info("Step 2: Filling Article Details")

        max_retries = 3
        for attempt in range(max_retries):
            if attempt == 0:
                title_loc = page.locator(f"{title_sel}, {title_fallback}")
                await title_loc.first.fill("")
                await title_loc.first.press_sequentially(
                    keyword, delay=random.randint(50, 100))
                await asyncio.sleep(random.uniform(0.5, 1.5))

                tags_loc = page.locator(f"{tags_sel}, {tags_fallback}")
                await tags_loc.first.fill("")
                await tags_loc.first.press_sequentially(
                    keyword, delay=random.randint(50, 100))
                await asyncio.sleep(random.uniform(0.5, 1.5))

                # Use fill() for description — press_sequentially would timeout on long text
                body_loc = page.locator(f"{body_sel}, {body_fallback}")
                await body_loc.first.fill(description_text)
                await asyncio.sleep(random.uniform(0.5, 1.5))

                # Category - Try selecting first option if present
                category_select = page.locator(category_sel)
                if await category_select.count() > 0:
                    try:
                        await category_select.first.select_option(index=1)
                    except Exception:
                        pass
            else:
                # On retry, check if fields are cleared and re-fill if necessary
                title_loc = page.locator(f"{title_sel}, {title_fallback}")
                if await title_loc.count() > 0 and await title_loc.first.input_value() == "":
                    await title_loc.first.fill("")
                    await title_loc.first.press_sequentially(
                        keyword, delay=random.randint(50, 100))
                
                tags_loc = page.locator(f"{tags_sel}, {tags_fallback}")
                if await tags_loc.count() > 0 and await tags_loc.first.input_value() == "":
                    await tags_loc.first.fill("")
                    await tags_loc.first.press_sequentially(
                        keyword, delay=random.randint(50, 100))
                
                body_loc = page.locator(f"{body_sel}, {body_fallback}")
                if await body_loc.count() > 0 and await body_loc.first.input_value() == "":
                    await body_loc.first.fill(description_text)

            # Handle Captcha
            self.logger.info(f"Solving captcha on submit page... (Attempt {attempt + 1}/{max_retries})")
            await self._solve_captcha_2captcha(page)

            # Submit the form
            submit_btn = page.locator(f"{submit_sel}, {submit_fallback}")

            await submit_btn.first.scroll_into_view_if_needed()
            await page.wait_for_timeout(500)

            try:
                await submit_btn.first.click(timeout=10000)
            except Exception:
                self.logger.warning("Normal click failed. Forcing JS click.")
                try:
                    fresh_btn = page.locator(f"{submit_sel}, {submit_fallback}")
                    await fresh_btn.first.evaluate("el => el.click()", timeout=10000)
                except Exception as js_err:
                    self.logger.warning(f"JS click also failed: {js_err}. Page may have already navigated.")

            self.logger.info("Bookmark form submitted. Waiting for result...")

            try:
                await page.wait_for_load_state("networkidle", timeout=30000)
                await page.wait_for_timeout(3000)
            except PlaywrightTimeoutError:
                self.logger.warning("Timeout waiting for submit result...")

            try:
                body_text = (await page.inner_text("body", timeout=15000)).lower()
            except PlaywrightTimeoutError:
                self.logger.warning("Timeout getting body text during submission. Refreshing...")
                try:
                    await page.reload(wait_until="domcontentloaded", timeout=30000)
                    body_text = (await page.inner_text("body", timeout=15000)).lower()
                except Exception as e:
                    self.logger.warning(f"Refresh also failed: {e}")
                    body_text = ""
            if "invalid captcha" in body_text or (
                "captcha" in body_text and "invalid" in body_text
            ) or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha detected on submit. Retrying...")
                await self._report_bad_captcha()
                if attempt == max_retries - 1:
                    raise CaptchaFailedError(
                        message="Max retries exceeded due to persistent invalid captcha on submit.",
                        step="submit_bookmark",
                        url=self.BASE_URL
                    )
                continue
            else:
                break

        # Extract backlink URL (uses base class implementation with config)
        backlink_url = await self._extract_backlink_url(page)
        if not backlink_url:
            current = page.url
            if "/story" in current:
                backlink_url = current
            else:
                raise SubmissionFailedError(
                    message="Could not extract backlink URL after submission. Check site changes.",
                    step="submit_bookmark",
                    url=self.BASE_URL
                )

        self.logger.info(f"Bookmark submitted. Extracted backlink: {backlink_url}")
        return backlink_url

    async def _logout(self, page: Page) -> None:
        """Logout using config-driven selectors."""
        self.logger.info("Attempting to log out...")

        dropdown_sel = self.get_selector("logout", "dropdown_toggle",
                                         "a.dropdown-toggle[data-toggle='dropdown']")
        logout_sel = self.get_selector("logout", "logout_link", "a[href='#logout']")

        try:
            # Try dropdown + logout link
            dropdown = page.locator(dropdown_sel).first
            if await dropdown.count() > 0:
                await dropdown.click()
                await page.wait_for_timeout(500)

            logout_link = page.locator(logout_sel)
            if await logout_link.count() > 0:
                await logout_link.first.click()
                await page.wait_for_timeout(2000)
                return

            # Fallback: try by text
            logout = page.get_by_text("logout", exact=False).first
            if await logout.count() > 0:
                await logout.click()
                await page.wait_for_timeout(2000)
                return

            # Fallback: JS function
            await page.evaluate("if (typeof logout === 'function') { logout(); }")
            await page.wait_for_timeout(2000)
        except Exception as e:
            self.logger.warning(f"Error during logout: {e}")
