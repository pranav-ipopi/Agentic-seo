"""
Captcha Service - Reusable Abstraction for Backlink Automation V1

This service provides an abstraction layer for solving captchas.
It is designed so that future integrations (2Captcha, CaptchaCracker, etc.)
can be plugged in without changing the site templates.

V1 Implementation:
- Uses a "stub" provider by default.
- Does NOT actually solve captchas (returns placeholder or raises).
- Templates should call this when captcha is detected.
- Real solving requires API keys and specific provider logic.

Interface:
    async def solve(
        self,
        page: Optional["playwright.async_api.Page"] = None,
        captcha_type: str = "unknown",
        site_key: Optional[str] = None,
        image_url: Optional[str] = None,
        **kwargs
    ) -> Optional[str]:
        ...

Future providers should implement the solve method.
Do NOT hardcode 2Captcha or any specific provider in templates.

For livebookmarking.com V1:
- Register page uses SolveMedia (old puzzle captcha).
- Login typically has no captcha.
- Submit may or may not have captcha.

Assumptions / Maintenance points:
- SolveMedia support will require custom logic (challenge + response fields like adcopy_response).
- When integrating real solver, pass the full page or necessary tokens.
- For V1, if captcha encountered, the job may fail until solver is integrated.
"""

import os
import logging
from typing import Optional, Any, Dict
from playwright.async_api import Page


class CaptchaService:
    """
    Abstract captcha solver.

    V1: Stub implementation only.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        provider: str = "stub",
        logger: Optional[logging.Logger] = None
    ):
        self.api_key = api_key or os.getenv("CAPTCHA_API_KEY")
        self.provider = provider or os.getenv("CAPTCHA_PROVIDER", "stub")
        self.logger = logger or logging.getLogger(__name__)
        self.logger.info(f"CaptchaService initialized with provider={self.provider}")

    async def solve(
        self,
        page: Optional[Page] = None,
        captcha_type: str = "unknown",
        site_key: Optional[str] = None,
        image_url: Optional[str] = None,
        **kwargs: Any
    ) -> Optional[str]:
        """
        Solve a captcha.

        Args:
            page: Playwright page object (for context, screenshots, or element extraction)
            captcha_type: e.g. "solvemedia", "recaptcha", "image", "unknown"
            site_key: For reCAPTCHA / hCaptcha style
            image_url: Direct image url if applicable
            **kwargs: Provider specific (e.g. pageurl for 2captcha)

        Returns:
            The solved token / answer string, or None if not solved.

        V1 behavior: Always returns a placeholder. Real solving not implemented.
        """
        self.logger.info(f"Captcha detected: type={captcha_type}, provider={self.provider}")

        if self.provider == "stub":
            self.logger.warning(
                "CaptchaService using STUB provider. "
                "No real solving performed. Job may fail if captcha is required. "
                "Integrate 2Captcha / CaptchaCracker for production."
            )
            # For V1 development / testing only - this will almost certainly fail real captcha
            if captcha_type == "solvemedia":
                # Typical SolveMedia response field expects the puzzle answer
                return "STUB_SOLVEMEDIA_ANSWER"  # Will not work on live site
            return "STUB_CAPTCHA_ANSWER"

        # Future: elif self.provider == "2captcha":
        #     return await self._solve_2captcha(...)
        # elif self.provider == "captchacracker":
        #     ...

        self.logger.error(f"Unsupported captcha provider: {self.provider}")
        return None

    async def solve_solvemedia(
        self,
        page: Page,
        **kwargs
    ) -> Optional[str]:
        """
        Specific helper for SolveMedia (used on livebookmarking.com register).
        In real implementation, this would extract challenge, submit to solver,
        then return the response value to fill into adcopy_response field.
        """
        self.logger.info("SolveMedia captcha requested (V1 stub)")
        return await self.solve(page=page, captcha_type="solvemedia", **kwargs)

    async def is_captcha_present(self, page: Page, selectors: Optional[list[str]] = None) -> bool:
        """
        Helper to detect if a captcha is visible on the current page.
        Templates can use this before calling solve().
        """
        default_selectors = [
            "img[src*='solvemedia']",
            "img[src*='captcha']",
            "iframe[src*='solvemedia']",
            "[class*='captcha']",
            "[id*='adcopy']",
            "text=CAPTCHA",
            "text=Your Answer"
        ]
        selectors = selectors or default_selectors

        for sel in selectors:
            try:
                if await page.locator(sel).count() > 0:
                    self.logger.info(f"Captcha element found with selector: {sel}")
                    return True
            except Exception:
                pass
        return False