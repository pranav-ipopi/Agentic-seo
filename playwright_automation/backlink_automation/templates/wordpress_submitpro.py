import asyncio
import random
import logging
from typing import Dict, Any, Optional
from urllib.parse import urlparse, parse_qs
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from templates.base_template import BaseTemplate
from executor.errors import SubmissionFailedError

class WordPressSubmitProTemplate(BaseTemplate):
    """
    Generic WordPress SubmitPro template.
    Handles registration and bookmark submission for WordPress sites running SubmitPro plugin.
    """

    def __init__(
        self,
        target_url: str,
        captcha_service,
        logger: logging.Logger,
        config: Dict[str, Any]
    ):
        super().__init__(target_url, captcha_service, logger, config)
        
        register_path = self.get_config("registration", "register_path", "/register/")
        submit_path = self.get_config("submission", "submit_path", "/submit/")
        
        self.REGISTER_URL = f"{self.BASE_URL}{register_path}"
        self.SUBMIT_URL = f"{self.BASE_URL}{submit_path}"
        
        # Sitekey fallback from config
        self.fallback_sitekey = self.get_config("captcha", "sitekey_fallback", "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId")

    async def run(self, page: Page, client_site: str, keyword: str) -> Dict[str, Any]:
        self.logger.info(f"Starting WordPressSubmitProTemplate on {self.BASE_URL} for client_site={client_site}, keyword={keyword}")
        
        # Step 1: Register Account
        await self._register_account(page)

        # Step 2: Submit Bookmark
        backlink_url = await self._submit_bookmark(page, client_site, keyword)

        self.logger.info(f"Successfully created WordPress backlink: {backlink_url}")
        return {
            "backlink_url": backlink_url,
            "success": True,
            "message": "Bookmark submitted successfully via WordPress SubmitPro template"
        }

    async def _solve_recaptcha_2captcha(self, page_url: str, sitekey: str) -> Optional[str]:
        self.logger.info(f"Solving Google reCAPTCHA v2 with 2captcha using sitekey: {sitekey}...")
        try:
            from twocaptcha import TwoCaptcha
            # Twocaptcha API key from source scripts
            api_key = self.get_config("captcha", "twocaptcha_api_key", '20205071fed24f4c1418d43380555585')
            solver = TwoCaptcha(api_key)
            
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, 
                lambda: solver.recaptcha(sitekey=sitekey, url=page_url)
            )
            token = result.get('code')
            if token:
                self.logger.info("Successfully solved reCAPTCHA!")
                return token
            else:
                self.logger.warning("Failed to solve reCAPTCHA: Empty code.")
                return None
        except ImportError:
            self.logger.error("twocaptcha is not installed. Run: pip install 2captcha-python")
            return None
        except Exception as e:
            self.logger.error(f"Error calling 2captcha: {e}")
            return None

    async def _get_sitekey(self, page: Page) -> str:
        site_key = None
        grecaptcha_element = page.locator("[data-sitekey]").first
        if await grecaptcha_element.count() > 0:
            site_key = await grecaptcha_element.get_attribute("data-sitekey")
        
        if not site_key:
            iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
            if await iframe.count() > 0:
                src = await iframe.get_attribute("src")
                if src:
                    parsed = urlparse(src)
                    site_key = parse_qs(parsed.query).get('k', [None])[0]
        
        if not site_key:
            site_key = self.fallback_sitekey
            
        return site_key

    async def _register_account(self, page: Page) -> None:
        self.credentials = self.generate_natural_credentials()
        self.logger.info(f"Navigating to registration page: {self.REGISTER_URL}")
        
        try:
            await self.safe_goto(page, self.REGISTER_URL, max_retries=3)
        except Exception as e:
            self.logger.warning(f"Initial navigation to registration page had warning/error: {e}")

        await self._handle_cloudflare(page)
        await page.wait_for_timeout(500)

        login_form_sel = self.get_selector("registration", "login_form", "#user_login")
        self.logger.info(f"Waiting for registration form {login_form_sel}...")
        try:
            await page.wait_for_selector(login_form_sel, timeout=30000)
        except Exception:
            pass

        # Fill registration form
        self.logger.info(f"Filling registration details for username={self.credentials['username']}")
        
        user_login_sel = self.get_selector("registration", "user_login", "#user_login")
        user_email_sel = self.get_selector("registration", "user_email", "#user_email")
        user_password_sel = self.get_selector("registration", "user_password", "#user_password")
        user_cpassword_sel = self.get_selector("registration", "user_cpassword", "#user_cpassword")
        nickname_sel = self.get_selector("registration", "nickname", "#nickname")
        
        if await page.locator(user_login_sel).count() > 0:
            await page.locator(user_login_sel).fill(self.credentials["username"])
        if await page.locator(user_email_sel).count() > 0:
            await page.locator(user_email_sel).fill(self.credentials["email"])
        if await page.locator(user_password_sel).count() > 0:
            await page.locator(user_password_sel).fill(self.credentials["password"])
        if await page.locator(user_cpassword_sel).count() > 0:
            await page.locator(user_cpassword_sel).fill(self.credentials["password"])
        if await page.locator(nickname_sel).count() > 0:
            await page.locator(nickname_sel).fill(self.credentials["username"])

        site_key = await self._get_sitekey(page)

        # Solve Captcha
        token = await self._solve_recaptcha_2captcha(page.url, site_key)
        if not token:
            self.logger.warning("Failed to solve registration reCAPTCHA.")
        else:
            self.logger.info("Injecting registration reCAPTCHA token...")
            await page.evaluate(f"""(token) => {{
                const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
                fields.forEach(el => {{
                    el.value = token;
                    el.innerHTML = token;
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
            }}""", token)
            await page.wait_for_timeout(500)

        self.logger.info("Submitting registration form...")
        submit_btn_sel = self.get_selector("registration", "submit_btn", "input[value='Register'], input[type='submit'], #wp-submit")
        submit_btn = page.locator(submit_btn_sel)
        if await submit_btn.count() > 0:
            try:
                await submit_btn.first.click(timeout=10000)
            except Exception:
                self.logger.warning("Normal registration click failed or timed out. Forcing JS click.")
                try:
                    await submit_btn.first.evaluate("el => el.click()", timeout=10000)
                except Exception as js_err:
                    self.logger.warning(f"JS click also failed: {js_err}. Page may have already navigated.")

        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass

        self.logger.info(f"URL after registration: {page.url}")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        self.logger.info(f"Navigating to submit page: {self.SUBMIT_URL}")
        try:
            await self.safe_goto(page, self.SUBMIT_URL, max_retries=3)
        except Exception as e:
            self.logger.warning(f"Initial navigation to submit page had warning/error: {e}")

        await self._handle_cloudflare(page)
        await page.wait_for_timeout(500)

        article_url_sel = self.get_selector("submission", "article_url", "#articleUrl")
        self.logger.info("Waiting for submission form fields...")
        try:
            await page.wait_for_selector(article_url_sel, timeout=15000)
        except Exception:
            pass

        # Prepare title
        title = keyword
        if len(title) < 30:
            title = f"{title} - Useful Resource and Discussion Link"

        self.logger.info("Filling article submission fields...")
        if await page.locator(article_url_sel).count() > 0:
            await page.locator(article_url_sel).first.fill(client_site)
            
        title_sel = self.get_selector("submission", "title", "#submitpro_title")
        if await page.locator(title_sel).count() > 0:
            await page.locator(title_sel).first.fill(title)

        # Select category via Select2 dropdown
        category_container_sel = self.get_selector("submission", "category_container", "[id*='submitpro_category-container'], #select2-submitpro_category-container, .select2-submitpro_category-container")
        category_container = page.locator(category_container_sel)
        
        if await category_container.count() > 0:
            try:
                # Sometimes there are multiple containers, trying the last one or first
                target_container = category_container.nth(2) if await category_container.count() > 2 else category_container.first
                await target_container.click()
                try:
                    await page.wait_for_selector(".select2-results__option:not(.select2-results__message)", timeout=2000)
                except Exception:
                    pass
                options = page.locator(".select2-results__option:not(.select2-results__message)")
                count = await options.count()
                if count > 0:
                    found_auto = False
                    for i in range(count):
                        text = await options.nth(i).inner_text()
                        if "automotive" in text.lower():
                            await options.nth(i).click()
                            found_auto = True
                            break
                    
                    if not found_auto:
                        start_idx = 1 if count > 1 else 0
                        rand_idx = random.randint(start_idx, count - 1)
                        await options.nth(rand_idx).click()
            except Exception as e:
                self.logger.warning(f"Error selecting Select2 category: {e}")
        else:
            cat_select_sel = self.get_selector("submission", "category_select", "#submitpro_category, select[name*='category']")
            cat_select = page.locator(cat_select_sel)
            if await cat_select.count() > 0:
                try:
                    select_elem = cat_select.first
                    options_info = await select_elem.evaluate(
                        "el => Array.from(el.options).map((o, i) => ({index: i, text: o.text.toLowerCase()}))"
                    )
                    auto_option = next((o for o in options_info if "automotive" in o["text"]), None)
                    if auto_option:
                        await select_elem.select_option(index=auto_option["index"])
                    elif len(options_info) > 1:
                        await select_elem.select_option(index=random.randint(1, len(options_info) - 1))
                    elif len(options_info) > 0:
                        await select_elem.select_option(index=0)
                except Exception:
                    pass

        # Fill tags
        tags_sel = self.get_selector("submission", "tags", "#tagsinput, .tagsinput, input[name='tagsinput'], input[name*='tags']")
        tags_field = page.locator(tags_sel)
        if await tags_field.count() > 0:
            await tags_field.first.fill(f"seo, marketing, backlinks, {keyword}")

        # Select location via Select2 dropdown
        location_container_sel = self.get_selector("submission", "location_container", "[id*='submitpro_location-container'], #select2-submitpro_location-container, .select2-submitpro_location-container")
        location_container = page.locator(location_container_sel)
        if await location_container.count() > 0:
            try:
                await location_container.first.click()
                try:
                    await page.wait_for_selector(".select2-results__option:not(.select2-results__message)", timeout=2000)
                except Exception:
                    pass
                options = page.locator(".select2-results__option:not(.select2-results__message)")
                count = await options.count()
                if count > 1:
                    await options.nth(random.randint(1, count - 1)).click()
                elif count > 0:
                    await options.first.click()
            except Exception as e:
                self.logger.warning(f"Error selecting Select2 location: {e}")

        # Fill other generic fields
        email_sel = self.get_selector("submission", "email", "#submitpro_email, input[name*='email']")
        email_field = page.locator(email_sel)
        if await email_field.count() > 0:
            await email_field.first.fill(f"contact_{int(random.random()*10000)}@mailinator.com")

        phone_sel = self.get_selector("submission", "phone", "#submitpro_phone, input[name*='phone']")
        phone_field = page.locator(phone_sel)
        if await phone_field.count() > 0:
            await phone_field.first.fill("+1 555-0199")

        address_sel = self.get_selector("submission", "address", "#submitpro_address, textarea[name*='address']")
        address_field = page.locator(address_sel)
        if await address_field.count() > 0:
            await address_field.first.fill("123 SEO Boulevard, Suite 100")

        # Rich description text
        desc_sel = self.get_selector("submission", "desc", "#submitpro_desc, textarea[name*='desc']")
        desc_field = page.locator(desc_sel)
        if await desc_field.count() > 0:
            default_templates = [
                "Digital marketing is a multifaceted strategy designed to reach, engage, and convert customers online. By optimizing on-page elements such as title tags, meta descriptions, and header tags, and by creating high-quality, relevant content, companies can attract targeted traffic for keyword {keyword}.",
                "Developing a successful online presence requires a mix of strategic planning, content marketing, and search engine optimization. Off-page marketing tactics, such as manual submission of high-quality backlinks and bookmarking, help search engines index resources faster and boost overall visibility for keyword {keyword}.",
                "Modern digital strategies rely heavily on search engine visibility and user experience to capture customer interest. Through optimization of content, metadata, and high-relevancy links, companies can dramatically improve their rankings on major search engines for keyword {keyword}."
            ]
            description_templates = self.get_config("submission", "description_templates", default_templates)
            description_text = random.choice(description_templates).format(keyword=keyword)
            await desc_field.first.fill(description_text)

        # Check terms and agreements checkbox
        agree_sel = self.get_selector("submission", "agree_checkbox", "#agree-checkbox, input[name='agree'], input[type='checkbox']")
        agree_checkbox = page.locator(agree_sel)
        if await agree_checkbox.count() > 0:
            try:
                await page.evaluate(f"() => {{ const cb = document.querySelector('{agree_sel.split(',')[0]}') || document.querySelector('input[type=\"checkbox\"]'); if (cb) {{ cb.click(); if(!cb.checked) cb.checked = true; }} }}")
            except Exception:
                pass

        await page.wait_for_timeout(500)

        site_key = await self._get_sitekey(page)

        # Solve Captcha
        token = await self._solve_recaptcha_2captcha(page.url, site_key)
        if not token:
            self.logger.warning("Failed to solve submission reCAPTCHA.")
        else:
            self.logger.info("Injecting submission reCAPTCHA token...")
            await page.evaluate(f"""(token) => {{
                const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
                fields.forEach(el => {{
                    el.value = token;
                    el.innerHTML = token;
                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                }});
            }}""", token)
            await page.wait_for_timeout(500)

        # Submit
        submit_btn_sel = self.get_selector("submission", "submit_btn", "input[value='Preview & Submit'], input[type='submit'], #submitpro_submit_btn")
        submit_btn = page.locator(submit_btn_sel).first
        if await submit_btn.count() > 0:
            try:
                await submit_btn.click(timeout=10000)
            except Exception:
                self.logger.warning("Normal submit click failed or timed out. Forcing JS click.")
                try:
                    await submit_btn.evaluate("el => el.click()", timeout=10000)
                except Exception as js_err:
                    self.logger.warning(f"JS click also failed: {js_err}. Page may have already navigated.")

        try:
            confirm_sel = self.get_selector("submission", "confirm_btn", "input[value='Submit'], input[value='Confirm'], button:has-text('Submit'), button:has-text('Confirm')")
            await page.wait_for_selector(confirm_sel, timeout=5000)
        except Exception:
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=5000)
            except Exception:
                pass

        # Check if preview/confirmation page requires final submit click
        confirm_sel = self.get_selector("submission", "confirm_btn", "input[value='Submit'], input[value='Confirm'], button:has-text('Submit'), button:has-text('Confirm')")
        confirm_btn = page.locator(confirm_sel).first
        if await confirm_btn.count() > 0:
            self.logger.info("Preview page detected. Clicking final submit...")
            try:
                await confirm_btn.click(timeout=10000)
            except Exception:
                self.logger.warning("Normal confirm click failed or timed out. Forcing JS click.")
                try:
                    await confirm_btn.evaluate("el => el.click()", timeout=10000)
                except Exception as js_err:
                    self.logger.warning(f"JS click also failed: {js_err}. Page may have already navigated.")
            try:
                await page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass

        # Extract backlink URL
        backlink_url = await self._extract_backlink_url(page)
        if not backlink_url:
            current = page.url
            if "/story" in current or "article" in current or "?p=" in current:
                backlink_url = current
            else:
                raise SubmissionFailedError(
                    message="Could not extract backlink URL after submission. Check site changes.",
                    step="submit_bookmark",
                    url=self.BASE_URL
                )

        return backlink_url

    async def _extract_backlink_url(self, page: Page) -> Optional[str]:
        current_url = page.url
        ignored_segments = ["/login", "/register", "/submit", "/dashboard", "/my-articles", "/wp-admin", "/my-account"]
        if not any(seg in current_url for seg in ignored_segments) and len(current_url) > len(self.BASE_URL) + 5:
            return current_url

        try:
            post_container = page.locator(".preview-listing div.blog-box[id^='post-'], div.blog-box[id^='post-']").first
            if await post_container.count() > 0:
                post_id_attr = await post_container.get_attribute("id")
                if post_id_attr and post_id_attr.startswith("post-"):
                    post_id = post_id_attr.replace("post-", "")
                    if post_id.isdigit():
                        return f"{self.BASE_URL}/?p={post_id}"
        except Exception:
            pass

        try:
            story_links = await page.locator("a[href*='/story'], a[href*='/articles/']").all()
            for link in story_links:
                href = await link.get_attribute("href")
                if href and ("/story" in href or "/articles/" in href) and len(href) > 20:
                    if not href.startswith("http"):
                        href = self.BASE_URL + href if href.startswith("/") else self.BASE_URL + "/" + href
                    if "#discuss" not in href and "#comments" not in href:
                        return href
        except Exception:
            pass

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
