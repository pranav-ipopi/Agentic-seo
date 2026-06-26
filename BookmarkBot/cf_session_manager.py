import asyncio
import json
import random
import os
import nodriver as uc
from pathlib import Path
from urllib.parse import urlparse
from logger_setup import get_logger

logger = get_logger("CFManager")

class CloudflareBypass:
    def __init__(self, proxy_manager=None):
        self.proxy_manager = proxy_manager
        self.session_dir = Path("sessions")
        self.session_dir.mkdir(exist_ok=True)
        
        self.viewports = [
            (1920, 1080),
            (1366, 768),
            (1536, 864),
            (1440, 900),
        ]
        
    def _get_session_file(self, target_domain: str, proxy: str) -> Path:
        """Create a safe filename for caching sessions based on domain and proxy."""
        safe_domain = target_domain.replace(".", "_").replace(":", "_")
        safe_proxy = proxy.replace("://", "_").replace(":", "_").replace("/", "_") if proxy else "noproxy"
        return self.session_dir / f"session_{safe_domain}_{safe_proxy}.json"

    def load_session(self, target_domain: str, proxy: str) -> list:
        """Load session cookies from disk if they exist."""
        session_file = self._get_session_file(target_domain, proxy)
        if session_file.exists():
            try:
                with open(session_file, "r") as f:
                    return json.load(f)
            except Exception as e:
                logger.error("Failed to load session from %s: %s", session_file, e)
        return []

    def save_session(self, target_domain: str, proxy: str, cookies: list):
        """Save session cookies to disk."""
        session_file = self._get_session_file(target_domain, proxy)
        try:
            with open(session_file, "w") as f:
                json.dump(cookies, f)
        except Exception as e:
            logger.error("Failed to save session to %s: %s", session_file, e)

    async def _human_like_scrape(self, page):
        """Simulate human-like interactions to pass behavioral analysis."""
        try:
            await asyncio.sleep(random.uniform(2, 4))
            
            # Scroll like a human
            for _ in range(3):
                scroll_amount = random.randint(200, 500)
                await page.evaluate(f'window.scrollBy(0, {scroll_amount})')
                await asyncio.sleep(random.uniform(0.5, 1.5))
            
            # Random mouse movement
            await page.evaluate('''
                () => {
                    const event = new MouseEvent('mousemove', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: Math.floor(Math.random() * 800) + 100,
                        clientY: Math.floor(Math.random() * 600) + 100
                    });
                    document.dispatchEvent(event);
                }
            ''')
            await asyncio.sleep(random.uniform(1, 2))
        except Exception as e:
            logger.warning("Human-like scrape error: %s", e)

    async def _get_cf_clearance_async(self, url: str, worker_id: int):
        """Internal async method to get clearance cookie using nodriver."""
        proxy = self.proxy_manager.get_proxy_for_worker(worker_id) if self.proxy_manager else None
        target_domain = urlparse(url).hostname
        
        # Check if we already have a valid session cached
        cached_cookies = self.load_session(target_domain, proxy)
        cf_cookie = next((c for c in cached_cookies if c.get('name') == 'cf_clearance'), None)
        if cf_cookie:
            logger.info("Worker %s: Found cached cf_clearance for %s", worker_id, target_domain)
            return cached_cookies

        logger.info("Worker %s: Harvesting new cf_clearance session for %s via nodriver", worker_id, target_domain)
        
        browser_args = []
        if proxy:
            browser_args.append(f'--proxy-server={proxy}')
            
        viewport = random.choice(self.viewports)
        browser_args.append(f'--window-size={viewport[0]},{viewport[1]}')
        
        # We run in headful mode because nodriver is best in headful for CF bypass
        browser = await uc.start(
            headless=False,
            browser_args=browser_args
        )
        
        try:
            page = await browser.get(url)
            
            # Wait and perform human-like actions
            await self._human_like_scrape(page)
            
            # Wait for CF to resolve
            await asyncio.sleep(8)
            
            cookies = await browser.cookies.get_all()
            cf_cookie_found = next(
                (c for c in cookies if c['name'] == 'cf_clearance'),
                None
            )
            
            if cf_cookie_found:
                logger.info("Worker %s: Successfully harvested cf_clearance for %s", worker_id, target_domain)
                self.save_session(target_domain, proxy, cookies)
                return cookies
            else:
                logger.warning("Worker %s: Could not find cf_clearance for %s. Might not be protected or challenge failed.", worker_id, target_domain)
                self.save_session(target_domain, proxy, cookies)
                return cookies
                
        finally:
            browser.stop()

    def get_cf_clearance(self, url: str, worker_id: int) -> list:
        """
        Synchronous wrapper to get clearance cookies. 
        Creates a new event loop so it can be called from ThreadPoolExecutor threads.
        """
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(self._get_cf_clearance_async(url, worker_id))
        finally:
            loop.close()

# Expose a singleton instance
from proxy_manager import proxy_manager
cf_bypass_manager = CloudflareBypass(proxy_manager=proxy_manager)
