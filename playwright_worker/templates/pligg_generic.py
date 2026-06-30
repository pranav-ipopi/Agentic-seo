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

from services.logging_service import log_event
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

    async def run(self, page: Page, client_site: str, keyword: str, description: str = "", tags: str = "") -> Dict[str, Any]:
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
        backlink_url = await self._submit_bookmark(page, client_site, keyword, description, tags)

        # Step 4: Logout
        await self._logout(page)

        self.logger.info(f"Successfully created backlink: {backlink_url}")
        log_event(self.logger, "bookmark_submitted", {
            "target_url": self.BASE_URL,
            "client_site": client_site,
            "keyword": keyword,
            "backlink_url": backlink_url
        })
        
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

    async def _call_ocr_fuzzer(self, image_path: str) -> dict:
        import httpx
        import os
        url = os.environ.get("OCR_FUZZER_URL", "http://localhost:8001/solve")
        try:
            async with httpx.AsyncClient() as client:
                with open(image_path, "rb") as f:
                    files = {"file": (os.path.basename(image_path), f, "image/png")}
                    response = await client.post(url, files=files, timeout=15.0)
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            self.logger.warning(f"OCR Fuzzer request failed: {e}")
        return {"text": "", "score": 0.0}

    async def _add_to_solvemedia_dict(self, text: str) -> None:
        import os
        import re
        import aiofiles
        
        assets_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
        dict_path = os.path.join(assets_dir, "solvemedia.txt")
        backup_path = os.path.join(assets_dir, "solvemedia_backup.txt")
        
        if not os.path.exists(dict_path):
            return
            
        async with aiofiles.open(dict_path, mode='r', encoding='utf-8') as f:
            content = await f.read()
            
        phrases = re.findall(r'["\'](.*?)["\']', content)
        if text not in phrases:
            # Backup
            async with aiofiles.open(backup_path, mode='w', encoding='utf-8') as f:
                await f.write(content)
                
            last_bracket_idx = content.rfind(']')
            if last_bracket_idx != -1:
                before_bracket = content[:last_bracket_idx].strip()
                if before_bracket.endswith(','):
                    insertion = f'\n    "{text}"\n'
                else:
                    insertion = f',\n    "{text}"\n'
                    
                new_content = content[:last_bracket_idx] + insertion + content[last_bracket_idx:]
                async with aiofiles.open(dict_path, mode='w', encoding='utf-8') as f:
                    await f.write(new_content)
                self.logger.info(f"Added new phrase to solvemedia dictionary: {text}")

    async def _solve_captcha(self, page: Page) -> None:
        """Solve SolveMedia captcha using OCR Fuzzer first, then fallback to 2Captcha."""
        self.logger.info("Attempting to solve SolveMedia captcha...")

        iframe_sel = self.get_selector("captcha", "iframe_selector", "#adcopy-puzzle-image-image iframe")
        image_fallback_sel = self.get_selector("captcha", "image_fallback", "img[src*='solvemedia']")
        response_field_sel = self.get_selector("captcha", "response_field", "#adcopy_response")
        refresh_btn_sel = "#adcopy-link-refresh"
        
        self.last_captcha_source = None
        self.last_captcha_text = None
        self.last_captcha_id = None

        try:
            captcha_frame = page.frame_locator(iframe_sel)
            captcha_img = captcha_frame.locator("img").first

            if await captcha_img.count() == 0:
                captcha_img = page.locator(image_fallback_sel).first

            if await captcha_img.count() > 0:
                ocr_success = False
                pred = ""
                
                # 3 Attempts with OCR Fuzzer
                for attempt in range(3):
                    self.logger.info(f"OCR Fuzzer attempt {attempt + 1}/3")
                    import uuid
                    import os
                    unique_id = uuid.uuid4().hex
                    img_path = f"solvemedia_captcha_{unique_id}.png"
                    
                    try:
                        await captcha_img.screenshot(path=img_path, timeout=10000)
                    except Exception as e:
                        self.logger.warning(f"Standard screenshot failed ({e}). Bypassing stability checks natively...")
                        try:
                            await captcha_img.focus()
                            await page.wait_for_timeout(500)
                        except Exception:
                            pass
                        
                        box = await captcha_img.bounding_box()
                        if box:
                            await page.screenshot(path=img_path, clip=box, timeout=10000)
                        else:
                            self.logger.error("Could not get bounding box for captcha.")
                            continue
                            
                    # Crop the "Enter the following:" text off the top of the image
                    try:
                        from PIL import Image
                        CROP_TOP = 30
                        with Image.open(img_path) as img:
                            captcha_crop = img.crop((0, CROP_TOP, img.width, img.height))
                            captcha_crop.save(img_path)
                    except ImportError:
                        self.logger.warning("Pillow (PIL) is not installed. Skipping image crop.")
                    except Exception as e:
                        self.logger.warning(f"Failed to crop captcha image: {e}")
                            
                    # Call API
                    result = await self._call_ocr_fuzzer(img_path)
                    
                    if os.path.exists(img_path):
                        try:
                            os.remove(img_path)
                        except:
                            pass
                            
                    if result and result.get("score", 0) >= 80:
                        self.logger.info(f"OCR Fuzzer matched: '{result['text']}' (Score: {result['score']})")
                        log_event(self.logger, "captcha_solved", {
                            "source": "ocr_fuzzer",
                            "text": result['text'],
                            "score": result['score']
                        })
                        pred = result['text']
                        ocr_success = True
                        self.last_captcha_source = 'ocr'
                        self.last_captcha_text = pred
                        break
                    else:
                        self.logger.warning(f"OCR Fuzzer low score or no match: '{result.get('text')}' (Score: {result.get('score')})")
                        if attempt < 2:
                            self.logger.info("Clicking refresh captcha button...")
                            refresh_btn = page.locator(refresh_btn_sel).first
                            if await refresh_btn.count() > 0:
                                await refresh_btn.click()
                                await page.wait_for_timeout(3000)
                            else:
                                self.logger.warning("Refresh button not found.")
                
                # Fallback to 2Captcha
                if not ocr_success:
                    self.logger.info("OCR Fuzzer failed 3 times. Falling back to 2Captcha...")
                    import uuid
                    import os
                    import asyncio
                    unique_id = uuid.uuid4().hex
                    img_path = f"solvemedia_captcha_{unique_id}.png"
                    
                    try:
                        await captcha_img.screenshot(path=img_path, timeout=10000)
                    except Exception as e:
                        try:
                            await captcha_img.focus()
                            await page.wait_for_timeout(500)
                        except Exception:
                            pass
                        box = await captcha_img.bounding_box()
                        if box:
                            await page.screenshot(path=img_path, clip=box, timeout=10000)
                            
                    # Crop the "Enter the following:" text off the top of the image for 2Captcha as well
                    try:
                        from PIL import Image
                        CROP_TOP = 30
                        with Image.open(img_path) as img:
                            captcha_crop = img.crop((0, CROP_TOP, img.width, img.height))
                            captcha_crop.save(img_path)
                    except ImportError:
                        pass
                    except Exception as e:
                        self.logger.warning(f"Failed to crop 2Captcha fallback image: {e}")
                            
                    def run_2captcha(image_path):
                        from twocaptcha import TwoCaptcha
                        api_key = os.environ.get('TWOCAPTCHA_API_KEY', '20205071fed24f4c1418d43380555585')
                        solver = TwoCaptcha(api_key)
                        return solver.normal(image_path)
                        
                    loop = asyncio.get_event_loop()
                    try:
                        result = await loop.run_in_executor(None, run_2captcha, img_path)
                    finally:
                        if os.path.exists(img_path):
                            try:
                                os.remove(img_path)
                            except:
                                pass
                                
                    if isinstance(result, dict):
                        pred = result.get('code', '').strip()
                        self.last_captcha_id = result.get('captchaId')
                    else:
                        pred = str(result).strip()
                        self.last_captcha_id = None
                        
                    self.logger.info(f"2captcha predicted: '{pred}'")
                    if pred:
                        self.last_captcha_source = '2captcha'
                        self.last_captcha_text = pred
                        log_event(self.logger, "captcha_solved", {
                            "source": "2captcha",
                            "text": pred
                        })

                if pred:
                    response_field = page.locator(response_field_sel)
                    await response_field.fill("")
                    await response_field.press_sequentially(pred, delay=20)
                    await page.wait_for_timeout(1000)
                else:
                    self.logger.warning("Captcha solving returned empty result.")
                    log_event(self.logger, "captcha_failed", {"reason": "empty result"})
            else:
                self.logger.warning("SolveMedia image element could not be found.")
                log_event(self.logger, "captcha_failed", {"reason": "image element not found"})
        except Exception as e:
            self.logger.error(f"Error solving captcha: {e}")
            log_event(self.logger, "captcha_failed", {"reason": f"error solving: {e}"})

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
        await page.wait_for_timeout(1000)

        self.logger.info("Filling registration form...")
        log_event(self.logger, "registration_started", {"target_url": self.BASE_URL})

        await page.wait_for_selector(username_sel, timeout=45000)

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info(f"Registration attempt {attempt + 1}/{max_retries}")

            if attempt == 0:
                # Fill registration form
                await self.human_type(page, username_sel, self.credentials["username"])
                await asyncio.sleep(random.uniform(0.5, 2.0))

                await self.human_type(page, email_sel, self.credentials["email"])
                await asyncio.sleep(random.uniform(0.5, 2.0))

                await self.human_type(page, password_sel, self.credentials["password"], is_sensitive=True)
                await asyncio.sleep(random.uniform(0.5, 2.0))

                await self.human_type(page, verify_sel, self.credentials["password"], is_sensitive=True)
                await asyncio.sleep(random.uniform(0.5, 2.0))
            else:
                # On retry, check if password fields got cleared
                if await page.locator(password_sel).count() > 0 and await page.locator(password_sel).input_value() == "":
                    await self.human_type(page, password_sel, self.credentials["password"], is_sensitive=True)
                    await asyncio.sleep(random.uniform(0.5, 2.0))
                if await page.locator(verify_sel).count() > 0 and await page.locator(verify_sel).input_value() == "":
                    await self.human_type(page, verify_sel, self.credentials["password"], is_sensitive=True)
                    await asyncio.sleep(random.uniform(0.5, 2.0))

            # Handle Captcha
            await self._solve_captcha(page)

            # Submit registration
            submit_btn = page.locator(f"{submit_sel}, {submit_fallback}")
            await self.human_click(page, submit_btn.first)

            # Wait for registration to complete
            await page.wait_for_timeout(4000)
            await page.wait_for_load_state("networkidle", timeout=40000)

            current_url = page.url
            if "/user/" in current_url:
                self.logger.info("Registration successful, redirected to user page.")
                log_event(self.logger, "registration_completed", {
                    "target_url": self.BASE_URL,
                    "username": self.credentials["username"]
                })
                if getattr(self, 'last_captcha_source', None) == '2captcha' and getattr(self, 'last_captcha_text', None):
                    await self._add_to_solvemedia_dict(self.last_captcha_text)
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
                log_event(self.logger, "registration_completed", {
                    "target_url": self.BASE_URL,
                    "username": self.credentials["username"],
                    "note": "Possible error or duplicate"
                })
                if getattr(self, 'last_captcha_source', None) == '2captcha' and getattr(self, 'last_captcha_text', None):
                    await self._add_to_solvemedia_dict(self.last_captcha_text)
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
                                await self.human_type(page, user_field, self.credentials["username"])
                            
                            # Fill password
                            pass_field = page.locator("input[name='password']").first
                            if await pass_field.count() > 0:
                                await self.human_type(page, pass_field, self.credentials["password"], is_sensitive=True)
                            
                            # Submit
                            login_btn = page.locator("input[type='submit'][value='Sign In'], button:has-text('Sign In'), input[name='processlogin']").first
                            if await login_btn.count() > 0:
                                await self.human_click(page, login_btn)
                                await page.wait_for_load_state("networkidle", timeout=15000)
                                await page.wait_for_timeout(2000)
                                
                                # Verify again
                                if await self._is_logged_in(page):
                                    self.logger.info("Manual login successful.")
                                    log_event(self.logger, "login_completed", {
                                        "target_url": self.BASE_URL,
                                        "username": self.credentials["username"]
                                    })
                                    if getattr(self, 'last_captcha_source', None) == '2captcha' and getattr(self, 'last_captcha_text', None):
                                        await self._add_to_solvemedia_dict(self.last_captcha_text)
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
                    log_event(self.logger, "registration_completed", {
                        "target_url": self.BASE_URL,
                        "username": self.credentials["username"],
                        "note": "Assumed success"
                    })
                    if getattr(self, 'last_captcha_source', None) == '2captcha' and getattr(self, 'last_captcha_text', None):
                        await self._add_to_solvemedia_dict(self.last_captcha_text)
                    break

        self.logger.info("Registration flow finished")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str, description: str = "", tags: str = "") -> str:
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
        description_text = description if description else random.choice(desc_templates).format(keyword=keyword)
        tags_text = tags if tags else keyword

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
        await self.human_type(page, url_field.first, client_site)
        await asyncio.sleep(random.uniform(0.5, 2.0))

        continue_btn = page.locator(f"{continue_sel}, {continue_fallback}")
        await self.human_click(page, continue_btn.first)

        await page.wait_for_load_state("domcontentloaded")
        await page.wait_for_timeout(2000)

        # Step 2: Article Details
        self.logger.info("Step 2: Filling Article Details")

        max_retries = 3
        for attempt in range(max_retries):
            if attempt == 0:
                title_loc = page.locator(f"{title_sel}, {title_fallback}")
                await self.human_type(page, title_loc.first, keyword)
                await asyncio.sleep(random.uniform(0.5, 1.5))

                tags_loc = page.locator(f"{tags_sel}, {tags_fallback}")
                await self.human_type(page, tags_loc.first, tags_text)
                await asyncio.sleep(random.uniform(0.5, 1.5))

                # Use fill() for description body — it can be very long text
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
                    await self.human_type(page, title_loc.first, keyword)
                
                tags_loc = page.locator(f"{tags_sel}, {tags_fallback}")
                if await tags_loc.count() > 0 and await tags_loc.first.input_value() == "":
                    await self.human_type(page, tags_loc.first, tags_text)
                
                body_loc = page.locator(f"{body_sel}, {body_fallback}")
                if await body_loc.count() > 0 and await body_loc.first.input_value() == "":
                    await body_loc.first.fill(description_text)

            # Handle Captcha
            self.logger.info(f"Solving captcha on submit page... (Attempt {attempt + 1}/{max_retries})")
            await self._solve_captcha(page)

            # Submit the form
            submit_btn = page.locator(f"{submit_sel}, {submit_fallback}")

            await submit_btn.first.scroll_into_view_if_needed()
            await page.wait_for_timeout(500)

            try:
                await self.human_click(page, submit_btn.first)
            except Exception:
                self.logger.warning("Human click failed. Forcing JS click.")
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
                if getattr(self, 'last_captcha_source', None) == '2captcha' and getattr(self, 'last_captcha_text', None):
                    await self._add_to_solvemedia_dict(self.last_captcha_text)
                break

        # Extract backlink URL
        # The user requested to absolutely pick up the current URL, not search for other stories.
        current_url = page.url
        
        if "login" in current_url.lower() or "register" in current_url.lower():
            raise SubmissionFailedError(
                message="Could not extract backlink URL after submission. Redirected to login/register.",
                step="submit_bookmark",
                url=self.BASE_URL
            )
            
        backlink_url = current_url

        self.logger.info(f"Bookmark submitted. Extracted backlink: {backlink_url}")
        return backlink_url

    async def _logout(self, page: Page) -> None:
        """Logout using config-driven selectors."""
        self.logger.info("Attempting to log out...")

        dropdown_sel = self.get_selector("logout", "dropdown_toggle",
                                         "a.dropdown-toggle[data-toggle='dropdown']")
        logout_sel = self.get_selector("logout", "logout_link", "a[href='#logout']")

        try:
            # Try dropdown + logout link (human-like — fixes teleportation)
            dropdown = page.locator(dropdown_sel).first
            if await dropdown.count() > 0:
                await self.human_click(page, dropdown)
                await page.wait_for_timeout(random.randint(400, 800))

            logout_link = page.locator(logout_sel)
            if await logout_link.count() > 0:
                await self.human_click(page, logout_link.first)
                await page.wait_for_timeout(2000)
                return

            # Fallback: try by text
            logout = page.get_by_text("logout", exact=False).first
            if await logout.count() > 0:
                await self.human_click(page, logout)
                await page.wait_for_timeout(2000)
                return

            # Fallback: JS function
            await page.evaluate("if (typeof logout === 'function') { logout(); }")
            await page.wait_for_timeout(2000)
        except Exception as e:
            self.logger.warning(f"Error during logout: {e}")
