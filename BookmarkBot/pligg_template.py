"""
pligg_template.py — SeleniumBase UC Mode port of playwright_worker/templates/pligg_generic.py

Mirrors the Playwright template logic exactly:
- Attempt 1: fill ALL fields fresh
- Retry: stay on same page, only re-fill cleared password/verify fields
  (captcha refreshes in-place, username/email remain)
- Captcha: screenshot iframe img via WebElement.screenshot(), send to 2captcha,
  type answer with send_keys() character-by-character with random delay
- Success detection: /user/ in URL, or logout text on page
- On unknown state: verify login before assuming success
"""

import os
import random
import string
import time
import uuid
from urllib.parse import urlparse


class PliggTemplate:
    """
    Handles the Pligg CMS automation flow using SeleniumBase UC Mode.
    Faithfully ported from playwright_worker/templates/pligg_generic.py.
    """

    def __init__(self, driver, logger):
        self.driver = driver
        self.logger = logger
        self.credentials = None
        self.last_captcha_id = None

    # ── Navigation ──────────────────────────────────────────────────────────
    def safe_goto(self, url: str):
        self.driver.uc_open_with_reconnect(url, reconnect_time=5)
        time.sleep(3)
        
        # Handle Cloudflare Turnstile "Verify you are human" if it appears
        try:
            self.driver.uc_gui_click_captcha()
            time.sleep(2)
        except Exception as e:
            self.logger.debug("Turnstile click not needed or failed: %s", e)

    # ── Helpers ──────────────────────────────────────────────────────────────
    def _switch_to_default(self):
        try:
            self.driver.switch_to.default_content()
        except Exception:
            pass

    def _slow_type(self, elem, text: str):
        """Type character-by-character with random delay to mimic human input."""
        for ch in text:
            elem.send_keys(ch)
            time.sleep(random.uniform(0.05, 0.15))

    def _is_logged_in(self) -> bool:
        """Check page for logout/sign-out text — mirrors base_template._is_logged_in."""
        try:
            body = self.driver.get_text("body").lower()
            url  = self.driver.get_current_url().lower()
            return (
                "logout" in body or
                "sign out" in body or
                "log out" in body or
                "/user/" in url
            )
        except Exception:
            return False

    @staticmethod
    def generate_random_credentials() -> dict:
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        username = f"user{suffix}"
        return {
            "username": username,
            "email": f"{username}@mailinator.com",
            "password": ''.join(random.choices(string.ascii_letters + string.digits, k=10)),
        }

    # ── Captcha ──────────────────────────────────────────────────────────────
    def _wait_for_captcha(self, timeout: int = 20) -> bool:
        """Wait until the SolveMedia iframe or fallback image is visible."""
        iframe_sel = "#adcopy-puzzle-image-image iframe"
        fallback   = "img[src*='solvemedia']"
        deadline   = time.time() + timeout
        while time.time() < deadline:
            if self.driver.is_element_visible(iframe_sel) or \
               self.driver.is_element_visible(fallback):
                return True
            time.sleep(1)
        return False

    def _solve_captcha_2captcha(self) -> bool:
        """
        Screenshot the SolveMedia captcha image, send to 2Captcha, type the result.
        Mirrors pligg_generic._solve_captcha_2captcha exactly.
        Returns True if answer was successfully typed.
        """
        self.logger.info("Attempting to solve SolveMedia captcha with 2captcha...")
        iframe_sel     = "#adcopy-puzzle-image-image iframe"
        image_fallback = "img[src*='solvemedia']"
        response_field = "#adcopy_response"

        try:
            if not self._wait_for_captcha(timeout=20):
                self.logger.warning("SolveMedia captcha did not appear — skipping.")
                return False

            in_iframe = False
            if self.driver.is_element_visible(iframe_sel):
                self.driver.switch_to_frame(iframe_sel)
                captcha_img_sel = "img"
                in_iframe = True
            else:
                captcha_img_sel = image_fallback

            if not self.driver.is_element_visible(captcha_img_sel):
                self.logger.warning("SolveMedia image not found inside frame — skipping.")
                if in_iframe:
                    self._switch_to_default()
                return False

            # Screenshot the img element directly (mirrors Playwright's captcha_img.screenshot())
            img_path = f"solvemedia_captcha_{uuid.uuid4().hex}.png"
            elem = self.driver.find_element(captcha_img_sel)
            elem.screenshot(img_path)

            if in_iframe:
                self._switch_to_default()

            # Submit to 2Captcha
            from twocaptcha import TwoCaptcha
            api_key = os.environ.get("TWOCAPTCHA_API_KEY", "")
            if not api_key:
                self.logger.error("TWOCAPTCHA_API_KEY is not set!")
                return False

            solver = TwoCaptcha(api_key)
            self.logger.info("Sending captcha image to 2captcha service...")
            try:
                result = solver.normal(img_path)
            finally:
                try:
                    os.remove(img_path)
                except Exception:
                    pass

            pred = ""
            if isinstance(result, dict):
                pred = result.get("code", "").strip()
                self.last_captcha_id = result.get("captchaId")
            else:
                pred = str(result).strip()
                self.last_captcha_id = None

            self.logger.info("2captcha predicted: '%s'", pred)

            if not pred:
                self.logger.warning("2captcha returned empty result.")
                return False

            # Fill response field — mirror Playwright's fill("") + press_sequentially()
            # Wait for the field to be on-screen and interactable
            self._switch_to_default()
            for _ in range(20):
                if self.driver.is_element_visible(response_field):
                    break
                time.sleep(0.5)

            resp_elem = self.driver.find_element(response_field)
            resp_elem.clear()
            self._slow_type(resp_elem, pred)
            time.sleep(1)
            return True

        except ImportError:
            self.logger.error("twocaptcha not installed. Run: pip install 2captcha-python")
        except Exception as e:
            self.logger.error("Error solving captcha: %s", e)
            self._switch_to_default()
        return False

    def _report_bad_captcha(self):
        if not self.last_captcha_id:
            return
        self.logger.info("Reporting bad captcha ID: %s", self.last_captcha_id)
        try:
            from twocaptcha import TwoCaptcha
            api_key = os.environ.get("TWOCAPTCHA_API_KEY", "")
            if api_key:
                TwoCaptcha(api_key).report(self.last_captcha_id, False)
        except Exception as e:
            self.logger.warning("Failed to report bad captcha: %s", e)
        self.last_captcha_id = None

    # ── Registration ─────────────────────────────────────────────────────────
    def register(self, base_url: str) -> bool:
        """
        Mirrors pligg_generic._register_account exactly:
        - Attempt 0: fill all fields fresh
        - Retry: stay on same page, only re-fill cleared password/verify fields
        """
        register_url = f"{base_url}/register"
        self.credentials = self.generate_random_credentials()
        self.logger.info("Registration started with username=%s", self.credentials["username"])

        self.safe_goto(register_url)
        time.sleep(3)

        # Wait for the username field to be ready (mirrors wait_for_selector)
        for _ in range(45):
            if self.driver.is_element_visible("#reg_username"):
                break
            time.sleep(1)

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info("Registration attempt %d/%d", attempt + 1, max_retries)

            if attempt == 0:
                # Fresh fill of ALL fields on first attempt
                for sel, val in [
                    ("#reg_username", self.credentials["username"]),
                    ("#reg_email",    self.credentials["email"]),
                    ("#reg_password", self.credentials["password"]),
                    ("#reg_verify",   self.credentials["password"]),
                ]:
                    if self.driver.is_element_visible(sel):
                        elem = self.driver.find_element(sel)
                        elem.clear()
                        self._slow_type(elem, val)
                        time.sleep(random.uniform(0.5, 2.0))
            else:
                # On retry: only re-fill password fields if they were cleared by the page
                for sel, val in [
                    ("#reg_password", self.credentials["password"]),
                    ("#reg_verify",   self.credentials["password"]),
                ]:
                    if self.driver.is_element_visible(sel):
                        try:
                            current = self.driver.find_element(sel).get_attribute("value") or ""
                        except Exception:
                            current = ""
                        if not current:
                            elem = self.driver.find_element(sel)
                            elem.clear()
                            self._slow_type(elem, val)
                            time.sleep(random.uniform(0.5, 2.0))

            # Solve captcha
            self._solve_captcha_2captcha()

            # Submit
            submit_sel = (
                "input.btn.btn-primary.reg_submit[value='Create user'], "
                "input[value='Create user'], "
                "input[type='submit']"
            )
            if self.driver.is_element_visible(submit_sel):
                self.driver.click(submit_sel)
            else:
                self.logger.warning("Registration submit button not found!")

            # Wait for page to settle (mirrors wait_for_timeout + wait_for_load_state)
            time.sleep(4)
            # Extra wait for networkidle-equivalent
            for _ in range(8):
                try:
                    if self.driver.execute_script("return document.readyState") == "complete":
                        break
                except Exception:
                    pass
                time.sleep(0.5)

            current_url = self.driver.get_current_url()
            if "/user/" in current_url:
                self.logger.info("Registration successful — redirected to /user/ page.")
                return True

            body_text = self.driver.get_text("body").lower()
            if "invalid captcha" in body_text or (
                "captcha" in body_text and "invalid" in body_text
            ) or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha detected. Reporting and retrying...")
                self._report_bad_captcha()
                if attempt == max_retries - 1:
                    raise RuntimeError("Max retries exceeded due to persistent invalid captcha on registration.")
                continue

            elif "error" in body_text or "already" in body_text:
                self.logger.warning("Possible registration error or duplicate username. Proceeding anyway.")
                return True

            else:
                # Unknown state — verify login like Playwright does
                self.logger.info("Registration completed (assumed success). Verifying login state...")
                time.sleep(2)
                if self._is_logged_in():
                    self.logger.info("Login state confirmed — registration successful.")
                    return True
                else:
                    self.logger.warning("Assumed-success but login state not confirmed — treating as failure.")
                    raise RuntimeError("Registration appeared to succeed but session could not be verified.")

        self.logger.error("Registration failed after %d attempts.", max_retries)
        return False

    # ── Submission ───────────────────────────────────────────────────────────
    def submit_bookmark(self, base_url: str, client_site: str, keyword: str) -> str:
        """Mirrors pligg_generic._submit_bookmark."""
        submit_url = f"{base_url}/submit"
        self.safe_goto(submit_url)
        time.sleep(3)

        # Guard: if redirected to login, session not authenticated
        current_url = self.driver.get_current_url().lower()
        if any(p in current_url for p in ("/login", "/register", "sign-in", "signin")):
            raise RuntimeError(
                f"Submit page redirected to {current_url} — session was not authenticated."
            )

        self.logger.info("Step 1: Submitting URL — %s | keyword: %s", client_site, keyword)

        # Wait for the URL field to be ready (mirrors wait_for_selector)
        url_sel = "#url, input[name='url'], input[name*='story_url'], input[type='url']"
        for _ in range(45):
            if self.driver.is_element_visible(url_sel):
                break
            time.sleep(1)

        if self.driver.is_element_visible(url_sel):
            elem = self.driver.find_element(url_sel)
            elem.clear()
            self._slow_type(elem, client_site)
            time.sleep(random.uniform(0.5, 2.0))
            continue_sel = "input[value='Continue'], input[type='submit'], button[type='submit']"
            if self.driver.is_element_visible(continue_sel):
                self.driver.click(continue_sel)
            else:
                self.logger.warning("Continue button not found — trying JS submit.")
                self.driver.execute_script("document.forms[0].submit()")
        else:
            self.logger.warning("URL field not found on /submit — skipping URL entry step.")

        # ── Wait for detail page (mirrors Playwright's wait_for_load_state + wait_for_selector) ──
        self.logger.info("Step 2: Waiting for article detail page to load...")
        title_sel = "#title, input[name='title']"
        detail_loaded = False
        for _ in range(45):
            if self.driver.is_element_visible(title_sel):
                detail_loaded = True
                break
            time.sleep(1)

        if not detail_loaded:
            self.logger.warning("Title field not found after Continue. Current URL: %s",
                                self.driver.get_current_url())

        # Diagnostic: screenshot and log what page we're actually on
        try:
            self.driver.save_screenshot("debug_detail_page.png")
            page_body = self.driver.get_text("body")[:600]
            self.logger.info("Detail page body snippet: %s", page_body.replace("\n", " "))
        except Exception:
            pass

        # Fill article details + solve captcha, retry on bad captcha
        desc_text = f"A resource related to {keyword}. Useful bookmark submission."
        tags_sel  = "#tags, input[name='tags']"
        body_sel  = "#bodytext, textarea[name='bodytext'], textarea[name='description']"
        cat_sel   = "select[name='category'], select[name='cat'], #category, select"

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info("Filling article details, attempt %d/%d", attempt + 1, max_retries)

            if attempt == 0:
                # Fill all detail fields fresh on first attempt
                for sel, val in [
                    (title_sel, keyword),
                    (tags_sel,  keyword),
                ]:
                    if self.driver.is_element_visible(sel):
                        elem = self.driver.find_element(sel)
                        elem.clear()
                        self._slow_type(elem, val)
                        time.sleep(random.uniform(0.5, 1.5))

                # Body — use send_keys (no slow type for long text)
                if self.driver.is_element_visible(body_sel):
                    elem = self.driver.find_element(body_sel)
                    elem.clear()
                    elem.send_keys(desc_text)
                    time.sleep(random.uniform(0.5, 1.5))

                # Category — pick first non-blank option
                if self.driver.is_element_visible(cat_sel):
                    try:
                        self.driver.select_option_by_index(cat_sel, 1)
                    except Exception:
                        pass
            else:
                # On retry: only re-fill cleared fields (mirrors Playwright approach)
                for sel, val in [(title_sel, keyword), (tags_sel, keyword)]:
                    if self.driver.is_element_visible(sel):
                        try:
                            current = self.driver.find_element(sel).get_attribute("value") or ""
                        except Exception:
                            current = ""
                        if not current:
                            elem = self.driver.find_element(sel)
                            elem.clear()
                            self._slow_type(elem, val)
                            time.sleep(random.uniform(0.5, 1.5))
                if self.driver.is_element_visible(body_sel):
                    try:
                        current = self.driver.find_element(body_sel).get_attribute("value") or ""
                    except Exception:
                        current = ""
                    if not current:
                        self.driver.find_element(body_sel).send_keys(desc_text)

            self.logger.info("Solving captcha on submit page... (attempt %d/%d)", attempt + 1, max_retries)
            self._solve_captcha_2captcha()

            # Scroll submit into view before clicking (mirrors scroll_into_view_if_needed)
            submit_sel = (
                "input[value='Save Changes and Submit'], "
                "input[type='submit'], button[type='submit']"
            )
            if self.driver.is_element_visible(submit_sel):
                try:
                    btn = self.driver.find_element(submit_sel)
                    self.driver.execute_script("arguments[0].scrollIntoView(true);", btn)
                    time.sleep(0.5)
                    btn.click()
                except Exception:
                    try:
                        self.driver.execute_script("arguments[0].click();", btn)
                    except Exception as e:
                        self.logger.warning("Submit click failed: %s", e)
            else:
                self.logger.warning("Submit button not found on detail page.")

            self.logger.info("Bookmark form submitted. Waiting for result...")
            # Wait for navigation (mirrors networkidle + wait_for_timeout 3000ms)
            time.sleep(5)
            for _ in range(10):
                try:
                    if self.driver.execute_script("return document.readyState") == "complete":
                        break
                except Exception:
                    pass
                time.sleep(0.5)
            time.sleep(3)

            # Diagnostic: log what page we ended up on
            post_submit_url = self.driver.get_current_url()
            post_body = self.driver.get_text("body")[:600]
            self.logger.info("Post-submit URL: %s", post_submit_url)
            self.logger.info("Post-submit body: %s", post_body.replace("\n", " ")[:400])

            body_text = post_body.lower()
            if "invalid captcha" in body_text or (
                "captcha" in body_text and "invalid" in body_text
            ) or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha on submit — reporting and retrying...")
                self._report_bad_captcha()
                if attempt == max_retries - 1:
                    raise RuntimeError("Max retries exceeded due to persistent invalid captcha on submit.")
                continue
            else:
                break

        # ── Extract backlink URL (mirrors base_template._extract_backlink_url) ──
        current_url = self.driver.get_current_url()

        # Strategy 1: /story in current URL
        if "/story" in current_url and "/login" not in current_url:
            self.logger.info("Backlink URL (from current URL): %s", current_url)
            return current_url

        # Strategy 2: find a[href*='/story'] links on the page
        try:
            links = self.driver.find_elements("a[href*='/story']")
            for link in links:
                href = link.get_attribute("href") or ""
                if href and len(href) > 20 and "#discuss" not in href and "#comments" not in href:
                    self.logger.info("Backlink URL (from story link): %s", href)
                    return href
        except Exception:
            pass

        # Strategy 3: success text present → use current URL
        body_text = self.driver.get_text("body").lower()
        for success_word in ["submitted", "success", "published", "your story", "under review"]:
            if success_word in body_text:
                self.logger.info("Success text '%s' found. Backlink: %s", success_word, current_url)
                if success_word == "under review":
                    return current_url + "#pending-review"
                return current_url

        self.logger.warning("Could not extract clean backlink URL. Final URL: %s", current_url)
        return current_url

    # ── Entry point ──────────────────────────────────────────────────────────
    def run(self, target_site: str, client_site: str, keyword: str) -> str:
        """Execute full Pligg flow: navigate → register → submit."""
        self.safe_goto(target_site)
        time.sleep(3)

        base_url = "{uri.scheme}://{uri.netloc}".format(uri=urlparse(self.driver.get_current_url()))
        self.logger.info("Base URL resolved: %s", base_url)

        ok = self.register(base_url)
        if not ok:
            raise RuntimeError(f"Registration failed on {base_url}")

        backlink = self.submit_bookmark(base_url, client_site, keyword)
        return backlink
