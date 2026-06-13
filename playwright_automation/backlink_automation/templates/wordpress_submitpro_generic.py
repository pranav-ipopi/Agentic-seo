import asyncio
import sys
import os
import random
import string
import logging
from typing import Dict, Any, Optional
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError
from twocaptcha import TwoCaptcha

# Add backlink_automation directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from methods.stealth_browser import StealthBrowserManager
from methods.cloudflare import bypass_cloudflare
from services.captcha_service import CaptchaService

def generate_random_credentials() -> Dict[str, str]:
    first_names = [
        "john", "mary", "james", "patricia", "robert", "jennifer", "michael", "elizabeth",
        "william", "linda", "david", "barbara", "richard", "susan", "joseph", "jessica",
        "thomas", "sarah", "charles", "karen", "christopher", "nancy", "daniel", "lisa",
        "matthew", "betty", "anthony", "margaret", "mark", "sandra", "donald", "ashley",
        "steven", "kimberly", "paul", "emily", "andrew", "donna", "joshua", "michelle",
        "kenneth", "carol", "kevin", "amanda", "brian", "dorothy", "george", "melissa",
        "timothy", "deborah", "ronald", "stephanie", "edward", "rebecca", "jason", "sharon",
        "jeffrey", "laura", "ryan", "cynthia", "jacob", "kathleen", "gary", "amy",
        "nicholas", "shirley", "eric", "angela", "jonathan", "helen", "stephen", "anna"
    ]
    last_names = [
        "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis",
        "rodriguez", "martinez", "hernandez", "lopez", "gonzalez", "wilson", "anderson",
        "thomas", "taylor", "moore", "jackson", "martin", "lee", "perez", "thompson",
        "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson", "walker",
        "young", "allen", "king", "wright", "scott", "torres", "nguyen", "hill",
        "flores", "green", "adams", "nelson", "baker", "hall", "rivera", "campbell"
    ]
    domains = [
        "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
        "mail.com", "aol.com", "zoho.com", "gmx.com", "yandex.com", "mailinator.com"
    ]
    
    first = random.choice(first_names)
    last = random.choice(last_names)
    sep = random.choice(["", "_", "."])
    num = random.randint(10, 9999)
    
    username = f"{first}{sep}{last}{num}"
    domain = random.choice(domains)
    email = f"{username}@{domain}"
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    
    return {
        "username": username,
        "email": email,
        "password": password
    }


class WordPressSubmitProTemplate:
    """
    Generic WordPress SubmitPro template.
    Handles registration and bookmark submission for WordPress sites running SubmitPro plugin.
    Used for sites like bookmarks2u.com and ukbookmarks.com.
    """

    def __init__(
        self,
        target_url: str,
        browser_manager: StealthBrowserManager,
        captcha_service: CaptchaService,
        logger: logging.Logger,
        sitekey: Optional[str] = None
    ):
        self.BASE_URL = target_url.rstrip('/')
        self.REGISTER_URL = f"{self.BASE_URL}/register/"
        self.SUBMIT_URL = f"{self.BASE_URL}/submit/"
        self.browser_manager = browser_manager
        self.captcha_service = captcha_service
        self.logger = logger
        
        # Determine/set the sitekey
        if sitekey:
            self.sitekey = sitekey
        elif "bookmarks2u" in self.BASE_URL:
            self.sitekey = "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId"
        elif "ukbookmarks" in self.BASE_URL:
            self.sitekey = "6LdsLkYUAAAAANTUsS-k_S47l1bSpqHPRG-U0XiI"
        else:
            self.sitekey = None

    async def run(self, client_site: str, keyword: str) -> Dict[str, Any]:
        self.logger.info(f"Starting WordPressSubmitProTemplate on {self.BASE_URL} for client_site={client_site}, keyword={keyword}")
        
        try:
            page = await self.browser_manager.get_page()

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
        except PlaywrightTimeoutError as e:
            self.logger.error(f"Timeout during WordPress automation: {e}")
            raise Exception(f"WordPress Timeout: {str(e)}") from e
        except Exception as e:
            self.logger.error(f"WordPress Automation failed: {e}")
            raise

    async def _solve_recaptcha_2captcha(self, page_url: str, sitekey: str) -> Optional[str]:
        self.logger.info(f"Solving Google reCAPTCHA v2 with 2captcha using sitekey: {sitekey}...")
        try:
            # Twocaptcha API key from source scripts
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
        creds = generate_random_credentials()
        self.logger.info(f"Navigating to registration page: {self.REGISTER_URL}")
        
        try:
            await page.goto(self.REGISTER_URL, wait_until="commit", timeout=60000)
        except Exception as e:
            self.logger.warning(f"Initial navigation to registration page had warning/error: {e}")

        await bypass_cloudflare(page)
        await page.wait_for_timeout(500)

        self.logger.info("Waiting for registration form #user_login...")
        await page.wait_for_selector("#user_login", timeout=30000)

        # Fill registration form
        self.logger.info(f"Filling registration details for username={creds['username']}")
        await page.locator("#user_login").fill(creds["username"])
        await page.locator("#user_email").fill(creds["email"])
        await page.locator("#user_password").fill(creds["password"])
        await page.locator("#user_cpassword").fill(creds["password"])
        await page.locator("#nickname").fill(creds["username"])

        # Determine sitekey if not static
        site_key = self.sitekey
        if not site_key:
            grecaptcha_element = page.locator("[data-sitekey]").first
            if await grecaptcha_element.count() > 0:
                site_key = await grecaptcha_element.get_attribute("data-sitekey")
            
            if not site_key:
                iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
                if await iframe.count() > 0:
                    src = await iframe.get_attribute("src")
                    import urllib.parse as urlparse
                    parsed = urlparse.urlparse(src)
                    site_key = urlparse.parse_qs(parsed.query).get('k', [None])[0]
            
            if not site_key:
                site_key = "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId" # Fallback

        # Solve Captcha
        token = await self._solve_recaptcha_2captcha(page.url, site_key)
        if not token:
            raise Exception("Failed to solve registration reCAPTCHA.")

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
        submit_btn = page.locator("input[value='Register'], input[type='submit'], #wp-submit")
        await submit_btn.first.click()

        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass

        self.logger.info(f"URL after registration: {page.url}")

    async def _submit_bookmark(self, page: Page, client_site: str, keyword: str) -> str:
        self.logger.info(f"Navigating to submit page: {self.SUBMIT_URL}")
        try:
            await page.goto(self.SUBMIT_URL, wait_until="commit", timeout=60000)
        except Exception as e:
            self.logger.warning(f"Initial navigation to submit page had warning/error: {e}")

        await bypass_cloudflare(page)
        await page.wait_for_timeout(500)

        self.logger.info("Waiting for submission form fields...")
        try:
            await page.wait_for_selector("#articleUrl", timeout=15000)
        except Exception:
            pass

        # Prepare title (minimum length requirement check from source files)
        title = keyword
        if len(title) < 30:
            title = f"{title} - Useful Resource and Discussion Link"

        self.logger.info("Filling article submission fields...")
        await page.locator("#articleUrl").first.fill(client_site)
        await page.locator("#submitpro_title").first.fill(title)

        # Select category via Select2 dropdown
        category_container = page.locator("[id*='submitpro_category-container'], #select2-submitpro_category-container, .select2-submitpro_category-container")
        if await category_container.count() > 0:
            try:
                await category_container.first.click()
                try:
                    await page.wait_for_selector(".select2-results__option:not(.select2-results__message)", timeout=2000)
                except Exception:
                    pass
                options = page.locator(".select2-results__option:not(.select2-results__message)")
                if await options.count() > 1:
                    await options.nth(1).click()
                elif await options.count() > 0:
                    await options.first.click()
            except Exception as e:
                self.logger.warning(f"Error selecting Select2 category: {e}")
        else:
            cat_select = page.locator("#submitpro_category, select[name*='category']")
            if await cat_select.count() > 0:
                try:
                    await cat_select.first.select_option(index=1)
                except Exception:
                    pass

        # Fill tags
        tags_field = page.locator("#tagsinput, .tagsinput, input[name='tagsinput'], input[name*='tags']")
        if await tags_field.count() > 0:
            await tags_field.first.fill("seo, marketing, backlinks")

        # Select location via Select2 dropdown
        location_container = page.locator("[id*='submitpro_location-container'], #select2-submitpro_location-container, .select2-submitpro_location-container")
        if await location_container.count() > 0:
            try:
                await location_container.first.click()
                try:
                    await page.wait_for_selector(".select2-results__option:not(.select2-results__message)", timeout=2000)
                except Exception:
                    pass
                options = page.locator(".select2-results__option:not(.select2-results__message)")
                if await options.count() > 1:
                    await options.nth(1).click()
                elif await options.count() > 0:
                    await options.first.click()
            except Exception as e:
                self.logger.warning(f"Error selecting Select2 location: {e}")

        # Fill other generic fields
        email_field = page.locator("#submitpro_email, input[name*='email']")
        if await email_field.count() > 0:
            # Using random/generated-style email contact
            await email_field.first.fill(f"contact_{int(random.random()*10000)}@mailinator.com")

        phone_field = page.locator("#submitpro_phone, input[name*='phone']")
        if await phone_field.count() > 0:
            await phone_field.first.fill("+1 555-0199")

        address_field = page.locator("#submitpro_address, textarea[name*='address']")
        if await address_field.count() > 0:
            await address_field.first.fill("123 SEO Boulevard, Suite 100")

        # Rich description text
        desc_field = page.locator("#submitpro_desc, textarea[name*='desc']")
        if await desc_field.count() > 0:
            if "velaather" in client_site.lower():
                description_templates = [
                    f"Discover the future of urban mobility with Vela Ather, the premier authorized partner for Ather electric scooters in Tamil Nadu. Our experience centers in Chennai and Trichy offer comprehensive sales, expert service, and authentic spare parts for models like the Ather 450X, 450S, Apex, and Rizta. Book a test ride today to feel the seamless performance, smart features, and eco-friendly efficiency of India's leading electric scooters. Experience a greener commute with Kaveri Group's dedicated automotive expertise supporting your EV journey for keyword {keyword}.",
                    f"Vela Ather is your trusted gateway to Ather Energy's state-of-the-art electric vehicles in Chennai and Trichy. Operating under Vela Automobile Private Limited, we provide a complete ecosystem for electric scooter enthusiasts, including test ride bookings, sales consultation, and highly equipped service workshops. Explore the top-rated Ather Rizta and 450 series with advanced battery tech and smart navigation. Our customer-centric approach ensures you receive unmatched assistance, making your transition to electric mobility smooth, reliable, and highly rewarding for keyword {keyword}.",
                    f"Experience the revolution of electric two-wheelers at Vela Ather, Tamil Nadu's leading showroom and service partner for Ather Energy. Part of the renowned Kaveri Group with decades of automotive excellence, Vela Ather brings eco-friendly riding solutions to Chennai (Guindy, Tambaram) and Trichy. Learn more about the latest Ather scooter models, charging solutions, and customized maintenance plans. Join thousands of happy riders who trust our expertise for booking test rides, purchase options, and reliable post-sale support for keyword {keyword}."
                ]
            else:
                description_templates = [
                    f"Digital marketing is a multifaceted strategy designed to reach, engage, and convert customers online. In today's highly competitive digital landscape, businesses must utilize a variety of tactics to establish a robust online presence. Search Engine Optimization (SEO) is at the core of this effort, focusing on improving a website's visibility in organic search results. By optimizing on-page elements such as title tags, meta descriptions, and header tags, and by creating high-quality, relevant content, companies can attract targeted traffic. Furthermore, off-page optimization, primarily through link building, plays a crucial role in establishing domain authority for keyword {keyword}.",
                    f"Developing a successful online presence requires a mix of strategic planning, content marketing, and search engine optimization. Off-page marketing tactics, such as manual submission of high-quality backlinks and bookmarking, help search engines index resources faster and boost overall visibility. By focusing on target audience demands and optimizing website speed, structure, and link quality, businesses can build a sustainable organic search footprint that drives traffic and increases engagement for keyword {keyword}.",
                    f"Modern digital strategies rely heavily on search engine visibility and user experience to capture customer interest. Through optimization of content, metadata, and high-relevancy links, companies can dramatically improve their rankings on major search engines. Integrating these diverse channels into a cohesive, data-driven plan enables businesses to optimize their marketing budget, improve conversion rates, and build authority within their niche for keyword {keyword}."
                ]
            
            description_text = random.choice(description_templates)
            await desc_field.first.fill(description_text)

        # Check terms and agreements checkbox
        agree_checkbox = page.locator("#agree-checkbox, input[name='agree'], input[type='checkbox']")
        if await agree_checkbox.count() > 0:
            try:
                await page.evaluate("() => { const cb = document.querySelector('#agree-checkbox') || document.querySelector('input[type=\"checkbox\"]'); if (cb) { cb.click(); if(!cb.checked) cb.checked = true; } }")
            except Exception:
                pass

        await page.wait_for_timeout(500)

        # Determine sitekey on submission page
        site_key = self.sitekey
        if not site_key:
            grecaptcha_element = page.locator("[data-sitekey]").first
            if await grecaptcha_element.count() > 0:
                site_key = await grecaptcha_element.get_attribute("data-sitekey")
            
            if not site_key:
                iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
                if await iframe.count() > 0:
                    src = await iframe.get_attribute("src")
                    import urllib.parse as urlparse
                    parsed = urlparse.urlparse(src)
                    site_key = urlparse.parse_qs(parsed.query).get('k', [None])[0]
            
            if not site_key:
                site_key = "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId" # Fallback

        # Solve Captcha
        token = await self._solve_recaptcha_2captcha(page.url, site_key)
        if not token:
            raise Exception("Failed to solve submission reCAPTCHA.")

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
        submit_btn = page.locator("input[value='Preview & Submit'], input[type='submit'], #submitpro_submit_btn").first
        await submit_btn.click()

        try:
            await page.wait_for_selector("input[value='Submit'], input[value='Confirm'], button:has-text('Submit'), button:has-text('Confirm')", timeout=5000)
        except Exception:
            try:
                await page.wait_for_load_state("domcontentloaded", timeout=5000)
            except Exception:
                pass

        # Check if preview/confirmation page requires final submit click
        confirm_btn = page.locator("input[value='Submit'], input[value='Confirm'], button:has-text('Submit'), button:has-text('Confirm')").first
        if await confirm_btn.count() > 0:
            self.logger.info("Preview page detected. Clicking final submit...")
            await confirm_btn.click()
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
                raise Exception("Could not extract backlink URL after submission.")

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


async def main():
    import logging
    
    # Configure logging
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger("run_wp_submitpro")
    
    # Sites to run on
    test_sites = [
        "https://www.a1bookmarks.com",
        "https://www.a2zbookmarking.com",
        "https://www.a2zbookmarks.com",
        "https://www.a2zsocialnews.com",
        "https://www.a2ztopnews.com",
        "https://www.activebookmarks.com",
        "https://www.addbusinessnow.com",
        "https://www.altbookmark.com",
        "https://www.appbookmarks.com",
        "https://www.articlebookmarks.com",
        "https://www.articlemerits.com",
        "https://www.articlevote.com",
        "https://www.bizzsubmit.com",
        "https://www.bookmark-template.com",
        "https://www.bookmarkbid.com",
        "https://www.bookmarkbuzz.com",
        "https://www.bookmarkcart.com",
        "https://www.bookmarkcart.info",
        "https://www.bookmarkcircle.com",
        "https://www.bookmarkdaddy.com",
        "https://www.bookmarkdeal.com",
        "https://www.bookmarkdiary.com",
        "https://www.bookmarkdrive.com",
        "https://www.bookmarkfeeds.com",
        "https://www.bookmarkfollow.com",
        "https://www.bookmarkgroups.com",
        "https://www.bookmarkidea.com",
        "https://www.bookmarkinbox.com",
        "https://www.bookmarkinbox.info",
        "https://www.bookmarkinghost.com",
        "https://www.bookmarkinghost.info",
        "https://www.bookmarkinglive.com",
        "https://www.bookmarkmaps.com",
        "https://www.bookmarkpedia.com",
        "https://www.bookmarks2u.com",
        "https://www.bookmarkset.com",
        "https://www.bookmarkspirit.com",
        "https://www.bookmarkstumble.com",
        "https://www.bookmarktalk.com",
        "https://www.bookmarktalk.info",
        "https://www.bookmarktheme.com",
        "https://www.bookmarktheme.info",
        "https://www.bookmarkvids.com",
        "https://www.bookmarkwiki.com",
        "https://www.bouchesocial.com",
        "https://www.bsocialbookmarking.info",
        "https://www.businessdocker.com",
        "https://www.businessfollow.com",
        "https://www.businessmerits.com",
        "https://www.businessnewsplace.com",
        "https://www.businessorgs.com",
        "https://www.businessveyor.com",
        "https://www.businesswebmarks.com",
        "https://www.cafebookmarks.com",
        "https://www.corpbookmarks.com",
        "https://www.corpdocker.com",
        "https://www.corpfollow.com",
        "https://www.corpjunction.com",
        "https://www.corplistings.com",
        "https://www.corpsubmit.com",
        "https://www.corpvotes.com",
        "https://www.craigsdirectory.com",
        "https://www.crossbookmarks.com",
        "https://www.dailywebmarks.com",
        "https://www.directoryfaves.com",
        "https://www.directoryfeeds.com",
        "https://www.directoryfield.com",
        "https://www.directoryfolks.com",
        "https://www.directorymate.com",
        "https://www.directoryminds.com",
        "https://www.directorynode.com",
        "https://www.directorypods.com",
        "https://www.directoryposts.com",
        "https://www.directoryrail.com",
        "https://www.directorysection.com",
        "https://www.directorystock.com",
        "https://www.dockerdirectory.com",
        "https://www.ewebmarks.com",
        "https://www.globalwebmarks.com",
        "https://www.greateststory.info",
        "https://www.hdbookmarks.com",
        "https://www.hexadirectory.com",
        "https://www.hotbookmarking.com",
        "https://www.indusdirectory.com",
        "https://www.industrybookmarks.com",
        "https://www.infradirectory.com",
        "https://www.instantbookmarks.com",
        "https://www.jobsmotive.com",
        "https://www.jobsrail.com",
        "https://www.johsocial.com",
        "https://www.kingslists.com",
        "https://www.legacydirectory.com",
        "https://www.leodirectory.com",
        "https://www.livewebmarks.com",
        "https://www.masterbookmarks.com",
        "https://www.nativebookmarks.com",
        "https://www.newsciti.com",
        "https://www.onlinewebmarks.com",
        "https://www.openfaves.com",
        "https://www.peoplebookmarks.com",
        "https://www.postarticlenow.com",
        "https://www.postbookmarks.com",
        "https://www.prbookmarks.com",
        "https://www.premiumbookmarks.com",
        "https://www.productbookmarks.com",
        "https://www.publicbuysell.com",
        "https://www.readybookmarks.com",
        "https://www.richbookmarks.com",
        "https://www.rootbookmarks.com",
        "https://www.seolinksubmit.com",
        "https://www.seosubmitbookmark.com",
        "https://www.serviceplaces.com",
        "https://www.sitemapdirectory.com",
        "https://www.socbookmarking.com",
        "https://www.socialbookmarkiseasy.info",
        "https://www.socialbookmarknow.info",
        "https://www.socialbookmarkzone.info",
        "https://www.socialevity.com",
        "https://www.socialmarkz.com",
        "https://www.socialmphl.com",
        "https://www.socialwebmarks.com",
        "https://www.stackbookmarks.com",
        "https://www.storebookmarks.com",
        "https://www.submitcorp.com",
        "https://www.submitfeeds.com",
        "https://www.submitindustry.com",
        "https://www.submitportal.com",
        "https://www.sudobookmarks.com",
        "https://www.sudobusiness.com",
        "https://www.systembookmarks.com",
        "https://www.tagbookmarks.com",
        "https://www.targetbookmarks.com",
        "https://www.techbookmarks.com",
        "https://www.teslabookmarks.com",
        "https://www.topwebmarks.com",
        "https://www.ukbookmarks.com",
        "https://www.ultrabookmarks.com",
        "https://www.urlvotes.com",
        "https://www.usbookmarks.com",
        "https://www.votearticles.com",
        "https://www.votetags.com",
        "https://www.votetags.info",
        "https://www.wikicraigs.com"
    ]
    
    # client_site = "https://example.com"
    client_site = "https://velaather.com"
    keyword = "Digital Marketing Guidelines"
    
    print("=" * 60)
    print(f"Starting execution for WordPress SubmitPro templates")
    print(f"Client Site: {client_site}")
    print(f"Keyword:     {keyword}")
    print("=" * 60)
    
    captcha_service = CaptchaService(logger=logger)
    
    for site in test_sites:
        print("\n" + "-" * 50)
        print(f"Running submission on {site}...")
        print("-" * 50)
        
        browser_manager = StealthBrowserManager()
        print("Launching stealth browser...")
        await browser_manager.start()
        
        template = WordPressSubmitProTemplate(
            target_url=site,
            browser_manager=browser_manager,
            captcha_service=captcha_service,
            logger=logger
        )
        
        try:
            result = await template.run(client_site, keyword)
            print(f"SUCCESS on {site}: {result}")
        except Exception as e:
            print(f"FAILED on {site}: {e}")
        finally:
            print("Closing stealth browser...")
            await browser_manager.close()
            
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
