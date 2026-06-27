"""
playwright_pligg_template.py — Async Playwright port of pligg_template.py.

Called after SeleniumBase UC Mode clears the Cloudflare challenge and hands
the live browser session to Playwright via CDP.

Key differences from pligg_template.py (SeleniumBase):
  - Navigation:  page.goto(wait_until="commit") — non-blocking
  - CF bypass:   Already done by SB before handover — not repeated here
  - Title poll:  Waits for title to leave "Just a moment" before acting
  - Form fill:   page.type() with delay= for human-like character-by-character typing
  - Waits:       page.wait_for_selector() — event-driven, no polling loops
  - Screenshots: locator.screenshot() — built-in Playwright method
  - Captcha:     solver.normal(img_path) — same 2captcha call as SB version
  - Delays:      asyncio.sleep() instead of time.sleep()
"""

import asyncio
import os
import random
import string
import time
import uuid
from urllib.parse import urlparse

from solvemedia_cache import save_captcha_answer


class PlaywrightPliggTemplate:
    """
    Async Playwright automation for Pligg CMS sites.

    Accepts a Playwright Page object that was handed over from SeleniumBase
    UC Mode after Cloudflare clearance. The CF challenge is already solved
    before this class is instantiated.
    """

    def __init__(self, page, logger):
        self.page = page
        self.logger = logger
        self.credentials = None
        self.last_captcha_id = None

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def generate_random_credentials() -> dict:
        suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
        username = f"user{suffix}"
        return {
            "username": username,
            "email": f"{username}@mailinator.com",
            "password": "".join(random.choices(string.ascii_letters + string.digits, k=10)),
        }

    async def _wait_for_cf_clear(self, timeout: float = 30.0):
        """
        Poll page title until it is no longer a Cloudflare challenge page.

        "Just a moment" / "Verify you are human" indicates CF is still active.
        We wait until it transitions to the real page title before touching any
        UI elements. This makes the handover reliable — CF can still run JS
        checks after the checkbox click.
        """
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            title = await self.page.title()
            url = self.page.url
            if (
                "Just a moment" not in title
                and "Verify you are human" not in title
                and "cdn-cgi" not in url
                and "challenge" not in url
            ):
                self.logger.info("CF clear confirmed — page title: '%s'", title)
                return True
            self.logger.debug("Waiting for CF to clear... title='%s'", title)
            await asyncio.sleep(1.0)
        self.logger.warning("CF did not clear within %.0fs — proceeding anyway.", timeout)
        return False

    async def _slow_type(self, selector: str, text: str):
        """
        Type character-by-character with random delay (human-like).
        Uses page.type() with delay parameter — Playwright's built-in method.
        """
        await self.page.locator(selector).click()
        await asyncio.sleep(random.uniform(0.2, 0.5))
        await self.page.type(selector, text, delay=random.randint(60, 140))

    async def _is_logged_in(self) -> bool:
        try:
            body = (await self.page.inner_text("body")).lower()
            url = self.page.url.lower()
            return (
                "logout" in body
                or "sign out" in body
                or "log out" in body
                or "/user/" in url
            )
        except Exception:
            return False

    # ── Captcha ──────────────────────────────────────────────────────────────

    async def _wait_for_solvemedia(self, timeout: int = 20) -> bool:
        """Wait until the SolveMedia iframe or fallback image is visible."""
        iframe_sel = "#adcopy-puzzle-image-image iframe"
        fallback = "img[src*='solvemedia']"
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                if await self.page.locator(iframe_sel).count() > 0:
                    return True
                if await self.page.locator(fallback).count() > 0:
                    return True
            except Exception:
                pass
            await asyncio.sleep(1.0)
        return False

    async def _solve_captcha_2captcha(self) -> bool:
        """
        Screenshot the SolveMedia captcha image, send to 2captcha, type result.
        Mirrors pligg_template._solve_captcha_2captcha exactly — same 2captcha call,
        solver.normal(img_path), same response field, same retry semantics.
        """
        self.logger.info("Attempting to solve SolveMedia captcha with 2captcha...")
        iframe_sel = "#adcopy-puzzle-image-image iframe"
        fallback = "img[src*='solvemedia']"
        response_field = "#adcopy_response"

        try:
            if not await self._wait_for_solvemedia(timeout=20):
                self.logger.warning("SolveMedia captcha did not appear — skipping.")
                return False

            img_path = f"solvemedia_captcha_{uuid.uuid4().hex}.png"

            # Screenshot the captcha image element directly
            if await self.page.locator(iframe_sel).count() > 0:
                # Inside an iframe — use frame_locator
                frame = self.page.frame_locator(iframe_sel)
                await frame.locator("img").screenshot(path=img_path)
            else:
                await self.page.locator(fallback).screenshot(path=img_path)

            # Submit to 2captcha — identical call to SB version
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

            # Fill response field — wait for it to be visible first
            await self.page.wait_for_selector(response_field, timeout=10000)
            await self.page.fill(response_field, "")
            await self.page.type(response_field, pred, delay=random.randint(60, 120))
            await asyncio.sleep(1.0)
            self._last_captcha_answer = pred  # saved only if site accepts it
            return True

        except ImportError:
            self.logger.error("twocaptcha not installed. Run: pip install 2captcha-python")
        except Exception as e:
            self.logger.error("Error solving captcha: %s", e)
        return False

    async def _report_bad_captcha(self):
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
        # Clear saved answer — it was wrong, don't persist it
        self._last_captcha_answer = None
        self.last_captcha_id = None

    def _persist_captcha_answer(self):
        """Save the last accepted SolveMedia answer to solvemedia.txt."""
        answer = getattr(self, "_last_captcha_answer", None)
        if answer:
            added = save_captcha_answer(answer)
            if added:
                self.logger.info("Saved new SolveMedia answer to cache: '%s'", answer)
            self._last_captcha_answer = None

    # ── Registration ─────────────────────────────────────────────────────────

    async def register(self, base_url: str) -> bool:
        """
        Navigate to /register and fill the form.

        Attempt 0: fill ALL fields fresh.
        Retry:     only re-fill cleared password fields (captcha refreshes in-place).
        """
        register_url = f"{base_url}/register"
        self.credentials = self.generate_random_credentials()
        self.logger.info("Registration started with username=%s", self.credentials["username"])

        await self.page.goto(register_url, wait_until="commit")

        # Wait for CF to fully clear before touching any UI
        await self._wait_for_cf_clear(timeout=30)
        await asyncio.sleep(2.0)

        # Wait for the username field (mirrors wait_for_selector)
        await self.page.wait_for_selector("#reg_username", timeout=45000)

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info("Registration attempt %d/%d", attempt + 1, max_retries)

            if attempt == 0:
                # Fresh fill of ALL fields
                for sel, val in [
                    ("#reg_username", self.credentials["username"]),
                    ("#reg_email",    self.credentials["email"]),
                    ("#reg_password", self.credentials["password"]),
                    ("#reg_verify",   self.credentials["password"]),
                ]:
                    if await self.page.locator(sel).count() > 0:
                        await self.page.fill(sel, "")
                        await self._slow_type(sel, val)
                        await asyncio.sleep(random.uniform(0.5, 2.0))
            else:
                # On retry: only re-fill cleared password fields
                for sel, val in [
                    ("#reg_password", self.credentials["password"]),
                    ("#reg_verify",   self.credentials["password"]),
                ]:
                    if await self.page.locator(sel).count() > 0:
                        current = await self.page.locator(sel).input_value()
                        if not current:
                            await self.page.fill(sel, "")
                            await self._slow_type(sel, val)
                            await asyncio.sleep(random.uniform(0.5, 2.0))

            # Solve SolveMedia captcha
            await self._solve_captcha_2captcha()

            # Submit
            submit_sel = (
                "input.btn.btn-primary.reg_submit[value='Create user'], "
                "input[value='Create user'], "
                "input[type='submit']"
            )
            btn = self.page.locator(submit_sel).first
            if await btn.count() > 0:
                await btn.scroll_into_view_if_needed()
                await btn.click()
            else:
                self.logger.warning("Registration submit button not found!")

            # Wait for page to settle
            await self.page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(2.0)

            current_url = self.page.url
            if "/user/" in current_url:
                self.logger.info("Registration successful — redirected to /user/ page.")
                self._persist_captcha_answer()  # Pligg accepted the SolveMedia answer
                return True

            body_text = (await self.page.inner_text("body")).lower()
            if "invalid captcha" in body_text or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha. Reporting and retrying...")
                await self._report_bad_captcha()
                if attempt == max_retries - 1:
                    raise RuntimeError("Max retries exceeded — persistent invalid captcha on registration.")
                continue

            elif "error" in body_text or "already" in body_text:
                self.logger.warning("Possible registration error or duplicate username. Proceeding anyway.")
                return True

            else:
                self.logger.info("Registration state unclear — verifying login...")
                await asyncio.sleep(2.0)
                if await self._is_logged_in():
                    self.logger.info("Login state confirmed — registration successful.")
                    self._persist_captcha_answer()  # Pligg accepted the SolveMedia answer
                    return True
                else:
                    self.logger.warning("Login state not confirmed after registration.")
                    raise RuntimeError("Registration appeared to succeed but session could not be verified.")

        self.logger.error("Registration failed after %d attempts.", max_retries)
        return False

    # ── Submission ───────────────────────────────────────────────────────────

    async def submit_bookmark(self, base_url: str, client_site: str, keyword: str) -> str:
        """Submit the client URL as a bookmark and return the live backlink URL."""
        submit_url = f"{base_url}/submit"
        await self.page.goto(submit_url, wait_until="commit")
        await asyncio.sleep(2.0)

        # Guard: if redirected to login, session broke
        current_url = self.page.url.lower()
        if any(p in current_url for p in ("/login", "/register", "sign-in", "signin")):
            raise RuntimeError(f"Submit page redirected to {current_url} — not authenticated.")

        self.logger.info("Step 1: Submitting URL — %s | keyword: %s", client_site, keyword)

        # Wait for URL field
        url_sel = "#url, input[name='url'], input[name*='story_url'], input[type='url']"
        await self.page.wait_for_selector(url_sel, timeout=45000)

        await self.page.fill(url_sel, "")
        await self._slow_type(url_sel, client_site)
        await asyncio.sleep(random.uniform(0.5, 2.0))

        continue_sel = "input[value='Continue'], input[type='submit'], button[type='submit']"
        btn = self.page.locator(continue_sel).first
        if await btn.count() > 0:
            await btn.click()
        else:
            self.logger.warning("Continue button not found — trying JS submit.")
            await self.page.evaluate("document.forms[0].submit()")

        # Wait for detail page
        self.logger.info("Step 2: Waiting for article detail page...")
        title_sel = "#title, input[name='title']"
        try:
            await self.page.wait_for_selector(title_sel, timeout=45000)
        except Exception:
            self.logger.warning("Title field not found after Continue. URL: %s", self.page.url)

        # Diagnostic screenshot
        try:
            await self.page.screenshot(path="debug_detail_page.png")
            body_snippet = (await self.page.inner_text("body"))[:600]
            self.logger.info("Detail page body: %s", body_snippet.replace("\n", " "))
        except Exception:
            pass

        desc_text = f"A resource related to {keyword}. Useful bookmark submission."
        tags_sel = "#tags, input[name='tags']"
        body_sel = "#bodytext, textarea[name='bodytext'], textarea[name='description']"
        cat_sel  = "select[name='category'], select[name='cat'], #category, select"

        max_retries = 3
        for attempt in range(max_retries):
            self.logger.info("Filling article details, attempt %d/%d", attempt + 1, max_retries)

            if attempt == 0:
                # Fill all fields fresh
                for sel, val in [(title_sel, keyword), (tags_sel, keyword)]:
                    if await self.page.locator(sel).count() > 0:
                        await self.page.fill(sel, "")
                        await self._slow_type(sel, val)
                        await asyncio.sleep(random.uniform(0.5, 1.5))

                if await self.page.locator(body_sel).count() > 0:
                    await self.page.fill(body_sel, desc_text)
                    await asyncio.sleep(random.uniform(0.5, 1.5))

                if await self.page.locator(cat_sel).count() > 0:
                    try:
                        await self.page.select_option(cat_sel, index=1)
                    except Exception:
                        pass
            else:
                # Retry: only re-fill cleared fields
                for sel, val in [(title_sel, keyword), (tags_sel, keyword)]:
                    if await self.page.locator(sel).count() > 0:
                        current = await self.page.locator(sel).input_value()
                        if not current:
                            await self.page.fill(sel, "")
                            await self._slow_type(sel, val)
                            await asyncio.sleep(random.uniform(0.5, 1.5))

                if await self.page.locator(body_sel).count() > 0:
                    current = await self.page.locator(body_sel).input_value()
                    if not current:
                        await self.page.fill(body_sel, desc_text)

            self.logger.info("Solving submit-page captcha (attempt %d)...", attempt + 1)
            await self._solve_captcha_2captcha()

            submit_sel = (
                "input[value='Save Changes and Submit'], "
                "input[type='submit'], button[type='submit']"
            )
            sbtn = self.page.locator(submit_sel).first
            if await sbtn.count() > 0:
                await sbtn.scroll_into_view_if_needed()
                await sbtn.click()
            else:
                self.logger.warning("Submit button not found on detail page.")

            self.logger.info("Submitted. Waiting for result...")
            try:
                await self.page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            await asyncio.sleep(3.0)

            post_url = self.page.url
            body_text = (await self.page.inner_text("body")).lower()
            self.logger.info("Post-submit URL: %s", post_url)

            if "invalid captcha" in body_text or "wrong answer" in body_text:
                self.logger.warning("Invalid captcha on submit — retrying...")
                await self._report_bad_captcha()
                if attempt == max_retries - 1:
                    raise RuntimeError("Max retries exceeded — persistent invalid captcha on submit.")
                continue
            else:
                self._persist_captcha_answer()  # Pligg accepted the SolveMedia answer
                break

        # ── Extract backlink URL ──────────────────────────────────────────────
        current_url = self.page.url

        if "/story" in current_url and "/login" not in current_url:
            self.logger.info("Backlink URL (from current URL): %s", current_url)
            return current_url

        try:
            links = await self.page.locator("a[href*='/story']").all()
            for link in links:
                href = await link.get_attribute("href") or ""
                if href and len(href) > 20 and "#discuss" not in href and "#comments" not in href:
                    self.logger.info("Backlink URL (from story link): %s", href)
                    return href
        except Exception:
            pass

        body_text = (await self.page.inner_text("body")).lower()
        for success_word in ["submitted", "success", "published", "your story", "under review"]:
            if success_word in body_text:
                self.logger.info("Success text '%s' found. Backlink: %s", success_word, current_url)
                if success_word == "under review":
                    return current_url + "#pending-review"
                return current_url

        self.logger.warning("Could not extract clean backlink URL. Final URL: %s", current_url)
        return current_url

    # ── Entry point ──────────────────────────────────────────────────────────

    async def run(self, target_url: str, client_site: str, keyword: str) -> str:
        """Full Pligg flow: wait for CF clear → register → submit."""
        # Wait for the page CF already handed off to be fully clear
        await self._wait_for_cf_clear(timeout=30)

        base_url = "{uri.scheme}://{uri.netloc}".format(uri=urlparse(self.page.url))
        self.logger.info("Base URL resolved: %s", base_url)

        ok = await self.register(base_url)
        if not ok:
            raise RuntimeError(f"Registration failed on {base_url}")

        backlink = await self.submit_bookmark(base_url, client_site, keyword)
        return backlink
