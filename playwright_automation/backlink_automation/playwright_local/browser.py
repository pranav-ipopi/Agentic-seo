"""
Playwright Browser Manager for Backlink Automation V1

Provides a reusable browser/context for site templates.
Keeps implementation simple for V1.

Features:
- Headless Chromium
- Reasonable user agent and viewport
- Context per use (or shared)
- Easy cleanup

Usage in template:
    browser_manager = BrowserManager()
    async with browser_manager.new_context() as context:
        page = await context.new_page()
        await page.goto(...)
"""

import os
import logging
from contextlib import asynccontextmanager
from typing import Optional
from playwright.async_api import (
    async_playwright,
    Playwright,
    Browser,
    BrowserContext,
    Page
)
from camoufox.async_api import AsyncCamoufox


class BrowserManager:
    """
    Manages Playwright browser lifecycle.
    V1: Simple launch + context creation.
    """

    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger(__name__)
        self._camoufox_ctx = None
        self.browser: Optional[Browser] = None
        self._launched = False

    async def launch(self) -> None:
        """Launch browser if not already running."""
        if self._launched:
            return

        self.logger.info("Launching Camoufox stealth browser (Cloudflare bypass with humanize)")
        
        from camoufox.async_api import AsyncCamoufox
        import os
        
        self._camoufox_ctx = AsyncCamoufox(
            headless=False,
            humanize=True,
            main_world_eval=False
        )
        self.browser = await self._camoufox_ctx.__aenter__()
        
        self.context = await self.browser.new_context(
            viewport={"width": 1366, "height": 768},
            ignore_https_errors=True,
            bypass_csp=True
        )
        self._launched = True
        self.logger.info("Camoufox browser launched successfully")

    async def close(self) -> None:
        """Close browser and playwright."""
        if hasattr(self, 'context') and self.context:
            await self.context.close()
            self.context = None
        if hasattr(self, '_camoufox_ctx') and self._camoufox_ctx:
            await self._camoufox_ctx.__aexit__(None, None, None)
            self._camoufox_ctx = None
        self._launched = False
        self.logger.info("Browser closed")

    @asynccontextmanager
    async def new_context(
        self,
        user_agent: Optional[str] = None,
        viewport: Optional[dict] = None,
        **context_options
    ):
        """Yields the context."""
        if not self._launched:
            await self.launch()

        try:
            yield self.context
        finally:
            pass

    async def new_page(self, context: Optional[BrowserContext] = None) -> Page:
        """Convenience: create a page."""
        if not self._launched:
            await self.launch()
        return await self.context.new_page()