import asyncio
import os
import time
from urllib.parse import quote, urlparse
from playwright.async_api import async_playwright
import logging

class BrowserlessSessionPool:
    def __init__(self, endpoints: list[str], proxy_manager, max_slots=22, logger=None):
        self.endpoints = endpoints
        self.proxy_manager = proxy_manager
        self.logger = logger or logging.getLogger(__name__)
        self.slots = []
        self.lock = asyncio.Lock()
        
        for i in range(max_slots):
            # Distribute slots evenly across endpoints
            endpoint = self.endpoints[i % len(self.endpoints)]
            proxy_url = self.proxy_manager.get_session(i)
            
            self.slots.append({
                "id": i,
                "endpoint": endpoint,
                "proxy_url": proxy_url,
                "session": None,
                "in_use": False,
                "initialized_at": None,
                "last_used": time.time(),
                "cf_clearance": None,
                "lifetime_requests": 0,
            })

    def _build_stealth_ws_url(self, endpoint: str, proxy_url: str | None) -> str:
        params = {
            "stealth": "true",
            "timeout": "600000"  # 10 minutes
        }
        
        token = os.environ.get("BROWSERLESS_TOKEN", "")
        if token:
            params["token"] = token
            
        if proxy_url:
            params["--proxy-server"] = proxy_url
            
        # Add realistic user agent to the launch args
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        if self.proxy_manager and proxy_url:
            user_agent = self.proxy_manager.get_user_agent(proxy_url)
        params["--user-agent"] = user_agent
            
        query = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
        return f"{endpoint}/?{query}"

    async def initialize(self):
        """Pre-warm all 22 slots."""
        self.logger.info(f"[Pool] Pre-warming {len(self.slots)} Browserless slots...")
        tasks = [self._warm_slot(slot) for slot in self.slots]
        await asyncio.gather(*tasks)
        self.logger.info("[Pool] All slots warmed and ready.")
        
        # Start background refresher
        asyncio.create_task(self._session_refresher())

    async def _warm_slot(self, slot: dict):
        """Create persistent Browserless session for slot."""
        try:
            ws_url = self._build_stealth_ws_url(slot["endpoint"], slot["proxy_url"])
            p = await async_playwright().start()
            browser = await p.chromium.connect_over_cdp(ws_url)
            if browser.contexts:
                context = browser.contexts[0]
            else:
                user_agent = self.proxy_manager.get_user_agent(slot["proxy_url"]) if self.proxy_manager and slot["proxy_url"] else "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                context = await browser.new_context(
                    user_agent=user_agent,
                    viewport={"width": 1920, "height": 1080},
                    locale="en-US",
                    timezone_id="America/New_York"
                )
                
            page = context.pages[0] if context.pages else await context.new_page()
            
            # Navigate to keep warm
            await page.goto("about:blank")
            
            slot["session"] = {
                "browser": browser,
                "context": context,
                "page": page,
                "playwright": p,
            }
            slot["initialized_at"] = time.time()
            slot["last_used"] = time.time()
            self.logger.info(f"[Slot {slot['id']}] Warmed successfully on {slot['endpoint']}")
        except Exception as e:
            self.logger.error(f"[Slot {slot['id']}] Failed to warm: {e}")

    async def _recreate_slot(self, slot: dict):
        """Clean up and recreate a broken slot."""
        if slot["session"]:
            try:
                await slot["session"]["browser"].close()
            except Exception:
                pass
            try:
                await slot["session"]["playwright"].stop()
            except Exception:
                pass
        slot["session"] = None
        await self._warm_slot(slot)

    async def checkout_slot(self, job=None):
        """Get an available slot, with health check."""
        async with self.lock:
            available = [s for s in self.slots if not s["in_use"]]
            if not available:
                return None
            
            # Pick least recently used
            slot = min(available, key=lambda x: x["last_used"])
            slot["in_use"] = True
            slot["last_used"] = time.time()
            
        # Health check outside lock so we don't block other checkouts
        for attempt in range(2):
            try:
                if not slot["session"]:
                    await self._recreate_slot(slot)
                    
                page = slot["session"]["page"]
                await page.evaluate("1 + 1")
                
                # Check for CF clearance cookie
                cookies = await slot["session"]["context"].cookies()
                cf = next((c for c in cookies if c["name"] == "cf_clearance"), None)
                if cf:
                    slot["cf_clearance"] = cf["value"]
                    if self.proxy_manager and slot["proxy_url"]:
                        user_agent = self.proxy_manager.get_user_agent(slot["proxy_url"])
                        self.proxy_manager.set_cf_clearance(slot["proxy_url"], cf, user_agent)
                
                return slot
            except Exception as e:
                self.logger.warning(f"[Slot {slot['id']}] Health check failed ({e}), recreating...")
                await self._recreate_slot(slot)

        # If it failed twice, return it to the pool as broken and return None
        async with self.lock:
            slot["in_use"] = False
        return None

    async def checkin_slot(self, slot: dict, harvest_cookies: bool = True):
        """Return session to pool, optionally harvest cookies."""
        if harvest_cookies and slot["session"] and self.proxy_manager and slot["proxy_url"]:
            try:
                cookies = await slot["session"]["context"].cookies()
                cf = next((c for c in cookies if c["name"] == "cf_clearance"), None)
                if cf:
                    user_agent = self.proxy_manager.get_user_agent(slot["proxy_url"])
                    self.proxy_manager.set_cf_clearance(slot["proxy_url"], cf, user_agent)
            except Exception as e:
                self.logger.warning(f"[Slot {slot['id']}] Cookie harvest failed on checkin: {e}")

        # Reset state
        try:
            if slot["session"]:
                await slot["session"]["page"].goto("about:blank")
        except Exception as e:
            self.logger.warning(f"[Slot {slot['id']}] Failed to reset to about:blank: {e}")
            
        async with self.lock:
            slot["in_use"] = False
            slot["lifetime_requests"] += 1

    async def _session_refresher(self):
        """Every 20 min, refresh cf_clearance on idle sessions."""
        while True:
            await asyncio.sleep(1200)  # 20 minutes
            self.logger.info("[Pool] Running background cf_clearance refresher...")
            
            for slot in self.slots:
                if slot["in_use"] or not slot["session"]:
                    continue
                    
                try:
                    page = slot["session"]["page"]
                    await page.goto("https://cloudflare.com/login", timeout=15000)
                    await asyncio.sleep(2)
                    
                    cookies = await slot["session"]["context"].cookies()
                    cf = next((c for c in cookies if c["name"] == "cf_clearance"), None)
                    if cf:
                        slot["cf_clearance"] = cf["value"]
                        if self.proxy_manager and slot["proxy_url"]:
                            user_agent = self.proxy_manager.get_user_agent(slot["proxy_url"])
                            self.proxy_manager.set_cf_clearance(slot["proxy_url"], cf, user_agent)
                            
                    await page.goto("about:blank")
                except Exception as e:
                    self.logger.warning(f"[Refresh] Slot {slot['id']} failed: {e}. Will recreate on next checkout.")
                    slot["session"] = None  # Force recreation
