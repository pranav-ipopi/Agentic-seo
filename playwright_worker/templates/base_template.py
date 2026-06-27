"""
Base Template for Backlink Automation

Abstract base class that all site templates inherit from.
Provides:
    - Config-driven selector access
    - Shared Cloudflare bypass
    - Safe page navigation with retry + error classification
    - Login detection
    - Backlink URL extraction
    - Common credential generation

All templates MUST implement:
    async def run(self, client_site: str, keyword: str) -> dict
"""

import asyncio
import random
import string
import os
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError


class BaseTemplate(ABC):
    """
    Abstract base template. All site automation templates extend this.

    Constructor signature is standardized so the runner can instantiate
    any template uniformly.
    """

    def __init__(
        self,
        target_url: str,
        captcha_service,
        logger: logging.Logger,
        config: Dict[str, Any]
    ):
        self.BASE_URL = target_url.rstrip('/')
        self.captcha_service = captcha_service
        self.logger = logger
        self.config = config
        self.credentials: Optional[Dict[str, str]] = None

    # ----------------------------------------------------------------
    # Config helpers
    # ----------------------------------------------------------------

    def get_selector(self, section: str, key: str, default: str = "") -> str:
        """
        Read a selector string from the merged config.

        Usage:
            self.get_selector("registration", "username_field")
            self.get_selector("registration", "submit_button_fallback", "input[type='submit']")
        """
        return self.config.get(section, {}).get(key, default)

    def get_config(self, section: str, key: str, default: Any = None) -> Any:
        """Read any config value (not just selectors)."""
        return self.config.get(section, {}).get(key, default)

    # ----------------------------------------------------------------
    # Human-like interaction wrappers
    # ----------------------------------------------------------------

    async def human_click(self, page: Page, locator_or_selector):
        """Wrapper for human-like click."""
        from methods.human_interaction import human_click
        loc = page.locator(locator_or_selector).first if isinstance(locator_or_selector, str) else locator_or_selector
        await human_click(page, loc)

    async def human_type(self, page: Page, locator_or_selector, text: str, is_sensitive: bool = False):
        """Wrapper for human-like typing with jitter/typos."""
        from methods.human_interaction import human_type
        loc = page.locator(locator_or_selector).first if isinstance(locator_or_selector, str) else locator_or_selector
        await human_type(page, loc, text, is_sensitive)

    # ----------------------------------------------------------------
    # Safe navigation with retry
    # ----------------------------------------------------------------

    async def safe_goto(self, page: Page, url: str, max_retries: int = 3, timeout: int = 60000) -> bool:
        """
        Centralized defensive navigation. Handles network-level retries,
        forces 'commit' wait states, and hooks directly into the active Cloudflare bypass.
        Returns True if successful, raises SiteDownError or returns False on failure.
        """
        from executor.errors import SiteDownError, ConnectionTimeoutError
        from methods.stealth_browser import handle_cloudflare_challenge

        for attempt in range(max_retries):
            try:
                self.logger.info(f"Navigating to {url} (Attempt {attempt + 1}/{max_retries})")
                
                # Use 'commit' to prevent timing out on intercept pages
                response = await page.goto(url, wait_until="commit", timeout=timeout)
                
                if not response:
                    self.logger.warning(f"No response received from {url}. Retrying...")
                    continue

                # Check for explicit network blocks or drop states
                if response.status in [403, 503, 520]:
                    self.logger.warning(f"Hit intercept status code: {response.status} at {url}")
                elif response.status >= 500 and response.status != 520:
                    self.logger.warning(f"Server error {response.status} from {url}. Retrying...")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(5)
                        continue
                    else:
                        raise SiteDownError(url=url, message=f"Server error {response.status} from {url} after {max_retries} attempts")
                elif response.status >= 400 and response.status not in [403]:
                    self.logger.warning(f"Client error {response.status} from {url}. Retrying...")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(5)
                        continue

                # Call active mouse emulation logic immediately
                # handle_cloudflare_challenge handles its own internal retry
                challenge_cleared = await handle_cloudflare_challenge(page)
                
                if challenge_cleared:
                    self.logger.info(f"Navigation and security check successfully passed for {url}")
                    return True
                else:
                    self.logger.error(f"Cloudflare remained un-cleared on attempt {attempt + 1}")

            except PlaywrightTimeoutError as e:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    self.logger.warning(f"Connection timeout on {url} (attempt {attempt + 1}/{max_retries}). Retrying in {wait}s...")
                    await asyncio.sleep(wait)
                else:
                    raise ConnectionTimeoutError(url=url, message=f"Connection timed out after {max_retries} attempts: {url}") from e

            except (SiteDownError, ConnectionTimeoutError):
                raise  # Propagate explicitly raised errors

            except Exception as e:
                error_str = str(e).lower()
                is_proxy_auth_error = 'err_invalid_auth_credentials' in error_str
                if is_proxy_auth_error:
                    if attempt < max_retries - 1:
                        wait = 2 * (attempt + 1)
                        self.logger.warning(f"Proxy auth error on {url}. Retrying in {wait}s...")
                        await asyncio.sleep(wait)
                        continue
                    else:
                        raise RuntimeError(f"Proxy authentication failed after {max_retries} retries on {url}. Check proxy credentials.") from e

                is_connection_error = any(err in error_str for err in ['net::err_connection', 'net::err_name', 'dns', 'net::err_aborted', 'err_http_response_code_failure', 'err_empty_response'])
                if is_connection_error and attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    self.logger.warning(f"Connection/Server error on {url}: {error_str}. Retrying in {wait}s...")
                    await asyncio.sleep(wait)
                elif is_connection_error:
                    raise SiteDownError(url=url, message=f"Site unreachable/broken after {max_retries} attempts: {url}") from e
                else:
                    self.logger.error(f"Network error during safe_goto to {url}: {str(e)}")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(3)
                    else:
                        await page.wait_for_timeout(2000)

        return False



    # ----------------------------------------------------------------
    # Login detection (config-driven)
    # ----------------------------------------------------------------

    async def _is_logged_in(self, page: Page) -> bool:
        """
        Heuristic to detect logged-in state using config-driven text markers.
        Checks for text like 'logout', 'sign out', 'log out' on the page.
        """
        logged_in_texts = self.get_config("login_detection", "logged_in_texts",
                                          ["logout", "sign out", "log out"])
        try:
            for text in logged_in_texts:
                if await page.get_by_text(text, exact=False).count() > 0:
                    return True
            return False
        except Exception:
            return False

    # ----------------------------------------------------------------
    # Credential generation
    # ----------------------------------------------------------------

    @staticmethod
    def generate_random_credentials() -> Dict[str, str]:
        """Generate highly random but natural-looking registration credentials for automation jobs."""
        return BaseTemplate.generate_natural_credentials()

    @staticmethod
    def generate_natural_credentials() -> Dict[str, str]:
        """Generate highly robust, natural-looking, and unique credentials."""
        first_names = [
            "john", "mary", "james", "patricia", "robert", "jennifer", "michael", "elizabeth",
            "william", "linda", "david", "barbara", "richard", "susan", "joseph", "jessica",
            "thomas", "sarah", "charles", "karen", "christopher", "nancy", "daniel", "lisa",
            "matthew", "betty", "anthony", "margaret", "mark", "sandra", "donald", "ashley",
            "steven", "kimberly", "paul", "emily", "andrew", "donna", "joshua", "michelle",
            "kenneth", "carol", "kevin", "amanda", "brian", "dorothy", "george", "melissa",
            "timothy", "deborah", "ronald", "stephanie", "edward", "rebecca", "jason", "sharon",
            "jeffrey", "laura", "ryan", "cynthia", "jacob", "kathleen", "gary", "amy",
            "nicholas", "shirley", "eric", "angela", "jonathan", "helen", "stephen", "anna",
            "alex", "sam", "taylor", "jordan", "morgan", "casey", "riley", "cameron", "quinn", "avery",
            "blake", "drew", "hunter", "logan", "micah", "parker", "reese", "rowan", "spencer", "hayden"
        ]
        last_names = [
            "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis",
            "rodriguez", "martinez", "hernandez", "lopez", "gonzalez", "wilson", "anderson",
            "thomas", "taylor", "moore", "jackson", "martin", "lee", "perez", "thompson",
            "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson", "walker",
            "young", "allen", "king", "wright", "scott", "torres", "nguyen", "hill",
            "flores", "green", "adams", "nelson", "baker", "hall", "rivera", "campbell",
            "mitchell", "carter", "roberts", "gomez", "phillips", "evans", "turner", "diaz",
            "parker", "cruz", "edwards", "collins", "reyes", "stewart", "morris", "morales", "murphy"
        ]
        domains = [
            "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
            "mail.com", "aol.com", "zoho.com", "gmx.com", "yandex.com", "protonmail.com",
            "live.com", "msn.com", "me.com", "mac.com", "inbox.com", "rocketmail.com"
        ]
        adjectives = ["cool", "super", "happy", "fast", "smart", "wild", "brave", "chill", "epic", "ninja", "pro", "master"]

        first = random.choice(first_names)
        last = random.choice(last_names)
        adj = random.choice(["", "", "", random.choice(adjectives)]) # 25% chance of adjective
        num = random.randint(10, 99999)
        unique_hash = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))

        if adj:
            username = f"{adj}{first}{last}{num}{unique_hash}"
        else:
            username = f"{first}{last}{num}{unique_hash}"
            
        domain = random.choice(domains)
        email = f"{username}@{domain}"
        
        # Robust password ensuring at least one uppercase, lowercase, digit, and special char
        password_base = ''.join(random.choices(string.ascii_letters + string.digits, k=12))
        password = f"{password_base}A1!"

        return {
            "username": username,
            "email": email,
            "password": password
        }

    # ----------------------------------------------------------------
    # Backlink URL extraction (shared logic)
    # ----------------------------------------------------------------

    async def _extract_backlink_url(self, page: Page) -> Optional[str]:
        """
        Try multiple strategies to find the newly created story/article URL.
        Uses config for selectors and patterns.
        """
        story_pattern = self.get_config("backlink_extraction", "story_url_pattern", "/story")
        story_link_sel = self.get_selector("backlink_extraction", "story_link_selector", "a[href*='/story']")
        success_texts = self.get_config("backlink_extraction", "success_texts",
                                        ["submitted", "success", "published", "your story"])

        # Strategy 1: Current page URL
        current_url = page.url
        if story_pattern in current_url and "login" not in current_url:
            return current_url

        # Strategy 2: Look for story/article links on the page
        try:
            story_links = await page.locator(story_link_sel).all()
            for link in story_links:
                href = await link.get_attribute("href")
                if href and story_pattern in href and len(href) > 20:
                    if not href.startswith("http"):
                        href = self.BASE_URL + href if href.startswith("/") else self.BASE_URL + "/" + href
                    if "#discuss" not in href and "#comments" not in href:
                        return href
        except Exception:
            pass

        # Strategy 3: Look for success text with nearby link
        try:
            for text in success_texts:
                locator = page.get_by_text(text, exact=False)
                if await locator.count() > 0:
                    parent = locator.first.locator("xpath=ancestor::div[1]")
                    link = parent.locator(story_link_sel).first
                    if await link.count() > 0:
                        href = await link.get_attribute("href")
                        if href:
                            if not href.startswith("http"):
                                href = self.BASE_URL + (href if href.startswith("/") else "/" + href)
                            return href
        except Exception:
            pass

        return None

    # ----------------------------------------------------------------
    # Abstract run method — every template MUST implement this
    # ----------------------------------------------------------------

    @abstractmethod
    async def run(self, page: Page, client_site: str, keyword: str) -> Dict[str, Any]:
        """
        Execute the full backlink creation flow.

        Args:
            client_site: The client URL to create a backlink for.
            keyword: The target keyword.

        Returns:
            Dict containing at minimum:
                {
                    "backlink_url": str,
                    "success": bool,
                    "message": str
                }
        """
        ...
