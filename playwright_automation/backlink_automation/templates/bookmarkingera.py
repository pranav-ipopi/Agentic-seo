"""
BookmarkingEra.com Site Template - V1

This is the site-specific implementation for https://bookmarkingera.com/
"""

import asyncio
import sys
import os
import random
import string
import logging
import re
import urllib.parse as urlparse

from typing import Dict, Any, Optional
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError
from twocaptcha import TwoCaptcha

# Add backlink_automation directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.captcha_service import CaptchaService
from methods.stealth_browser import StealthBrowserManager
from methods.cloudflare import bypass_cloudflare


def _generate_random_credentials() -> Dict[str, str]:
    """Generate random registration credentials."""
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    name = f"UserEra{suffix}"
    email = f"era_{suffix}@mailinator.com"
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=10)) + "!23"
    return {
        "name": name,
        "email": email,
        "password": password
    }


def _slugify(text: str) -> str:
    """Slugify text to construct the public detail page URL."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text).strip('-')
    return text


class BookmarkingEraTemplate:
    """
    Implementation of the BookmarkingEra.com submission process.
    Handles:
    - Cloudflare bypass
    - Account Registration
    - Google reCAPTCHA v2 bypass via 2Captcha
    - Submitting bookmark (Step 1 + Step 2)
    - Handling manual fallback if URL content fetch fails
    - Returning the created public backlink URL
    """

    BASE_URL = "https://bookmarkingera.com"
    REGISTER_URL = f"{BASE_URL}/register"
    SUBMIT_URL = f"{BASE_URL}/add/bookmark/url"

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
        self.logger.info(f"Starting BookmarkingEraTemplate for client_site={client_site}, keyword={keyword}")

        try:
            page = await self.browser_manager.get_page()

            # Step 1: Register Account
            await self._register_account(page)

            # Step 2: Create the bookmark / backlink
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

    async def _solve_recaptcha_2captcha(self, page_url: str, sitekey: str) -> Optional[str]:
        self.logger.info(f"Solving Google reCAPTCHA v2 with 2captcha using sitekey: {sitekey}...")
        try:
            api_key = '20205071fed24f4c1418d43380555585'
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
        except Exception as e:
            self.logger.error(f"Error calling 2captcha: {e}")
            return None

    async def _register_account(self, page: Page) -> None:
        """Register a new account."""
        self.credentials = _generate_random_credentials()
        self.logger.info(f"Registration started with email={self.credentials['email']}")

        await page.goto(self.REGISTER_URL, wait_until="domcontentloaded")
        await bypass_cloudflare(page)
        await page.wait_for_timeout(1500)

        # Fill registration form using selectors
        await page.locator("input#name").fill(self.credentials["name"])
        await page.locator("input#email").fill(self.credentials["email"])
        await page.locator("input#password").fill(self.credentials["password"])
        await page.locator("input#password_confirmation").fill(self.credentials["password"])

        self.logger.info("Submitting registration form...")
        await page.locator("button[type='submit']").click()

        # Wait for registration to complete and redirect to dashboard
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        if "dashboard" in page.url:
            self.logger.info("Successfully registered and logged in (dashboard detected)")
        else:
            self.logger.warning(f"Registration redirect URL was unexpected: {page.url}")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        """Submit the bookmark and return the created story/backlink URL."""
        self.logger.info(f"Bookmark submission started: url={client_site}, keyword={keyword}")

        await page.goto(self.SUBMIT_URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)

        # Step 1: Fill URL
        self.logger.info("Step 1: Filling URL")
        await page.locator("input#title").fill(client_site)

        # Find recaptcha sitekey
        self.logger.info("Locating Google reCAPTCHA sitekey...")
        sitekey = None
        grecaptcha_element = page.locator("[data-sitekey]").first
        if await grecaptcha_element.count() > 0:
            sitekey = await grecaptcha_element.get_attribute("data-sitekey")

        if not sitekey:
            iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
            if await iframe.count() > 0:
                src = await iframe.get_attribute("src")
                parsed = urlparse.urlparse(src)
                sitekey = urlparse.parse_qs(parsed.query).get('k', [None])[0]

        if not sitekey:
            raise Exception("Google reCAPTCHA sitekey could not be found on Step 1 submission page.")

        # Solve Captcha
        token = await self._solve_recaptcha_2captcha(page.url, sitekey)
        if not token:
            raise Exception("Failed to solve Google reCAPTCHA for Step 1.")

        self.logger.info("Injecting reCAPTCHA token into Step 1 page...")
        await page.evaluate(f"""(token) => {{
            const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
            fields.forEach(el => {{
                el.value = token;
                el.innerHTML = token;
            }});
        }}""", token)
        await page.wait_for_timeout(1000)

        self.logger.info("Submitting Step 1...")
        await page.locator("input#submit").click()

        # Wait for Step 2 page (with 60 second timeout for server curl time-outs)
        self.logger.info("Waiting for Step 2 page or manual entry link to load (up to 60 seconds)...")
        try:
            await page.wait_for_selector("select[name='category'], a[href*='/manual']", timeout=60000)
            
            # Check if the 'Add Mannually' link is visible
            manual_link = page.locator("a[href*='/manual']")
            if await manual_link.count() > 0 and await manual_link.is_visible():
                self.logger.info("Server curl timed out. Clicking 'Add Mannually' button...")
                await manual_link.click()
                # Wait for Category select to load on the manual page
                await page.wait_for_selector("select[name='category']", timeout=20000)
                
            self.logger.info("Successfully reached Step 2!")
        except Exception as e:
            self.logger.error(f"Failed to reach Step 2: {e}")
            raise

        self.logger.info(f"Step 2 page loaded: {page.url}")

        # Step 2: Fill Form Fields
        self.logger.info("Step 2: Filling Article Details")

        # URL Field - Fill if editable/empty (occurs on /manual fallback page)
        url_field = page.locator("input#url")
        if await url_field.count() > 0:
            val = await url_field.get_attribute("value") or ""
            is_readonly = await url_field.get_attribute("readonly") is not None
            if not val or not is_readonly:
                self.logger.info(f"URL field is blank or editable. Filling client_site URL: {client_site}")
                await url_field.fill(client_site)

        # Category
        category_select = page.locator("select[name='category']")
        # Select category index 2 (SEO) or fallback index 1
        try:
            await category_select.select_option("2")
        except Exception:
            try:
                await category_select.select_option(index=1)
            except Exception as e:
                self.logger.warning(f"Failed to select category option: {e}")

        # Title (between 10 and 200 characters)
        title = keyword
        if len(title) < 10:
            title = f"{title} - Useful SEO Resource"
        if len(title) > 200:
            title = title[:200]
        # Ensure no URL in title
        title = re.sub(r'https?://[^\s]+', '', title)
        title = re.sub(r'www\.[^\s]+', '', title)
        await page.locator("input#title").fill(title)

        # Description (between 200 and 700 characters, no URLs)
        description_templates = [
            "This is a detailed analysis of high performance search engine optimization tools. "
            "Developing quality backlinks is one of the most effective strategies to improve domain authority "
            "and increase organic search visibility. With modern automation techniques, webmasters can submit "
            "bookmarks and list resources more efficiently. These practices help indexing speed and ensure "
            "that search engines can locate high quality content across the web. Regular optimization and proper "
            "anchor text usage are key components of achieving top rankings on popular search engines today.",
            
            "Explore comprehensive SEO techniques and digital marketing strategies to boost search visibility. "
            "High quality content promotion, structural optimizations, and social bookmark submissions represent "
            "crucial tactics for long term authority enhancement. By leveraging targeted index lists and modern "
            "online reference tools, businesses can optimize user reach and discoverability. It is essential "
            "to focus on search relevancy, domain metrics, and clean anchor layouts to maximize search visibility "
            "across major crawlers in today's competitive online landscape."
        ]
        description = random.choice(description_templates)
        # Ensure no URLs in description
        description = re.sub(r'https?://[^\s]+', '', description)
        description = re.sub(r'www\.[^\s]+', '', description)
        if len(description) < 200:
            description = description.ljust(205, ' ')
        elif len(description) > 700:
            description = description[:700]
        await page.locator("textarea#articleBody").fill(description)

        # Keywords (between 30 and 300 characters, no URLs)
        keywords = "seo tools, search optimization, backlinks, link building, domain authority, web promotion, content marketing"
        if len(keywords) < 30:
            keywords = keywords.ljust(35, ' ')
        elif len(keywords) > 300:
            keywords = keywords[:300]
        await page.locator("input#keywords").fill(keywords)

        await page.wait_for_timeout(1000)

        self.logger.info("Submitting Step 2...")
        await page.locator("input#submit").click()

        # Wait for redirection to dashboard or all bookmarks
        await page.wait_for_timeout(5000)
        await page.wait_for_load_state("networkidle")

        self.logger.info(f"Page URL after final submit: {page.url}")

        # Construct created backlink URL
        slug = _slugify(title)
        backlink_url = f"{self.BASE_URL}/bookmark/{slug}"
        self.logger.info(f"Generated public backlink URL: {backlink_url}")
        
        return backlink_url
