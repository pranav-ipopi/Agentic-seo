"""
Template Detector (Playwright-based)

Replaces the Supabase Edge Function `detect-site-templates` which was blocked
by Cloudflare on datacenter IPs.

This module uses the existing StealthBrowserManager (SeleniumBase CDP + Playwright)
to fetch site HTML through an undetected browser, bypassing Cloudflare.

Fingerprinting logic mirrors the deleted edge function, ported to Python.

Usage:
    from services.template_detector import TemplateDetector

    detector = TemplateDetector(browser_manager, logger)
    template_id = await detector.detect("https://www.corpfollow.com")
    # Returns: "wordpress_submitpro" | "pligg" | "scuttle" | "drigg" | "unknown"
"""

import re
import logging
from typing import Optional

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

# Template IDs — must match values stored in target_sites.site_id
KNOWN_TEMPLATES = ("pligg", "phpld", "scuttle", "drigg")
PAGE_LOAD_TIMEOUT_MS = 30_000  # full page load timeout
JS_SETTLE_MS = 3_000           # wait after load for JS to render dynamic content
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


class TemplateDetector:
    """
    Navigates to a site URL using the stealth browser and fingerprints its CMS.

    Fingerprint checks (in priority order):
        1. Pligg / Kliqqi
        2. WordPress SubmitPro / PHPLD
        3. Scuttle / SemanticScuttle
        4. Drupal Drigg

    Returns "unknown" if no pattern matches.
    """

    def __init__(self, browser_manager, logger: logging.Logger):
        self.browser_manager = browser_manager
        self.logger = logger

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def detect(self, url: str) -> str | None:
        """
        Detect the CMS/template of a site by navigating to its homepage.

        Args:
            url: The target site URL (e.g. "https://www.corpfollow.com")

        Returns:
            One of: "pligg" | "wordpress_submitpro" | "scuttle" | "drigg"
            Returns None if detection was inconclusive (fetch failed or no pattern
            matched) — callers should NOT write anything to the DB in that case
            so the site gets retried on the next detection cycle.
        """
        page = None
        try:
            page = await self.browser_manager.get_page()
            html = await self._fetch_html(page, url)
            if not html:
                self.logger.warning(
                    f"[TemplateDetector] Failed to fetch HTML for {url} — will retry next cycle"
                )
                return None

            template = self._fingerprint(html, url)
            if template is None:
                self.logger.warning(
                    f"[TemplateDetector] No pattern matched for {url} — will retry next cycle"
                )
            else:
                self.logger.info(f"[TemplateDetector] {url} → {template}")
            return template

        except Exception as e:
            self.logger.error(f"[TemplateDetector] Error detecting template for {url}: {e}")
            return None  # Don't write 'unknown' — retry next cycle
        finally:
            if page:
                try:
                    await page.context.close()
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Page fetch with Cloudflare bypass
    # ------------------------------------------------------------------

    async def _fetch_html(self, page: Page, url: str) -> Optional[str]:
        """
        Navigate to the URL using the stealth browser and return raw HTML.

        Uses wait_until='load' (full page load including subresources) rather
        than 'domcontentloaded' so that JS-rendered content (like the
        submitproConfig variable on WordPress SubmitPro sites) is present in
        the DOM before we read page.content().
        """
        try:
            await page.set_extra_http_headers({"User-Agent": USER_AGENT})

            # 'load' waits for the full page load event — catches JS-rendered markers
            await page.goto(url, wait_until="load", timeout=PAGE_LOAD_TIMEOUT_MS)

            # Attempt Cloudflare challenge bypass (uses existing helper)
            try:
                from methods.stealth_browser import handle_cloudflare_challenge
                await handle_cloudflare_challenge(page)
            except Exception as cf_err:
                self.logger.debug(f"[TemplateDetector] Cloudflare bypass skipped/failed: {cf_err}")

            # Extra settle time for slow JS — SubmitPro sites inject config vars late
            await page.wait_for_timeout(JS_SETTLE_MS)

            html = await page.content()
            return html

        except PlaywrightTimeoutError:
            self.logger.warning(
                f"[TemplateDetector] Timeout navigating to {url} — will retry next cycle"
            )
            return None
        except Exception as e:
            self.logger.warning(f"[TemplateDetector] Navigation error for {url}: {e}")
            return None

    # ------------------------------------------------------------------
    # Fingerprinting logic
    # ------------------------------------------------------------------

    def _fingerprint(self, html: str, url: str = "") -> Optional[str]:
        """
        Inspect the raw HTML and return the matching template ID, or None if
        no known pattern was matched.

        Returns None (not 'unknown') so the caller can decide whether to
        retry rather than permanently labelling the site as unknown.
        """
        src = html.lower()

        # --- Pligg / Kliqqi ---
        if (
            "tpl_pligg" in src
            or "pligg_content" in src
            or "pligg-content" in src
            or "kliqqi-content" in src
            or 'name="pligg"' in src
            or "story.php?title=" in src
            or "pligg_" in src
            or self._meta_generator_matches(html, ["pligg", "kliqqi"])
        ):
            return "pligg"

        # --- WordPress SubmitPro / PHPLD (PHP Link Directory) ---
        if (
            "submitpro" in src
            or "phpld" in src
            or "php link directory" in src
            or "link_id=" in src
            or self._form_action_matches(html, "submit.php")
            or self._meta_generator_matches(html, ["phpld", "php link directory", "submitpro"])
            # Additional WP SubmitPro signals (theme path, JS config var, REST base)
            or "themes/submitpro" in src
            or "submitproconfig" in src
            or "submitpro_pr" in src
            # WordPress + directory submission keywords as combined signal
            or ("wp-content" in src and "submit-business" in src)
            or ("wp-content" in src and "submit-listing" in src)
            or ("wp-content" in src and "add-listing" in src)
        ):
            return "phpld"

        # --- Scuttle / SemanticScuttle ---
        if (
            "semanticscuttle" in src
            or "scuttle" in src
            or "bookmarks.php" in src
            or 'href="tags.php"' in src
            or 'href="tag.php"' in src
            or self._meta_generator_matches(html, ["scuttle"])
        ):
            return "scuttle"

        # --- Drupal Drigg ---
        if (
            "drigg" in src
            or "sites/all/modules/drigg" in src
            or 'class="drigg-vote"' in src
            or "/node/add/drigg" in src
        ):
            return "drigg"

        # No pattern matched — return None so the caller retries next cycle
        self.logger.debug(
            f"[TemplateDetector] No fingerprint matched for {url}. "
            f"HTML snippet: {html[:300]!r}"
        )
        return None

    # ------------------------------------------------------------------
    # Helper matchers
    # ------------------------------------------------------------------

    @staticmethod
    def _meta_generator_matches(html: str, keywords: list) -> bool:
        """Check if <meta name="generator"> content contains any of the keywords."""
        match = re.search(
            r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']',
            html, re.IGNORECASE
        )
        if not match:
            match = re.search(
                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']generator["\']',
                html, re.IGNORECASE
            )
        if not match:
            return False
        content = match.group(1).lower()
        return any(kw in content for kw in keywords)

    @staticmethod
    def _form_action_matches(html: str, path_segment: str) -> bool:
        """Check if any <form> element has an action attribute matching path_segment."""
        pattern = rf'<form[^>]+action=["\'][^"\']*{re.escape(path_segment)}[^"\']*["\']'
        return bool(re.search(pattern, html, re.IGNORECASE))
