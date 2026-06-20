import os
import random
import logging

class ProxyManager:
    def __init__(self, logger=None):
        self.logger = logger or logging.getLogger(__name__)
        self.primary_proxies = []
        self.fallback_proxies = []
        self.load_proxies()

    def load_proxies(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        primary_path = os.path.join(base_dir, 'configs', 'primary_proxies.txt')
        fallback_path = os.path.join(base_dir, 'configs', 'fallback_proxies.txt')
        
        # Load from .env if present (legacy support)
        env_proxy = os.getenv("PROXY_URL")
        if env_proxy:
            self.primary_proxies.append(env_proxy.strip())
            
        if os.path.exists(primary_path):
            with open(primary_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if line not in self.primary_proxies:
                            self.primary_proxies.append(line)
                            
        if os.path.exists(fallback_path):
            with open(fallback_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if line not in self.fallback_proxies:
                            self.fallback_proxies.append(line)
                            
        self.logger.info(f"[ProxyManager] Loaded {len(self.primary_proxies)} primary proxies and {len(self.fallback_proxies)} fallback proxies.")

    async def get_working_proxy(self, browser_manager):
        """
        Attempts to find a working proxy by sequentially testing them.
        Returns the proxy string if successful, or None if all fail.
        """
        use_proxy = os.getenv("USE_PROXY", "false").lower() == "true"
        if not use_proxy:
            return None
            
        if not self.primary_proxies and not self.fallback_proxies:
            self.logger.warning("[ProxyManager] USE_PROXY is true but no proxies are configured. Falling back to direct connection.")
            return None
            
        # Shuffle to spread load across all available proxies
        primary = self.primary_proxies.copy()
        random.shuffle(primary)
        
        fallback = self.fallback_proxies.copy()
        random.shuffle(fallback)
        
        # Try primary first, then fallback
        all_proxies = primary + fallback
        
        for proxy in all_proxies:
            self.logger.info(f"[ProxyManager] Testing proxy: {proxy}")
            browser_manager.set_proxy(proxy)
            check_page = None
            try:
                check_page = await browser_manager.get_page()
                await check_page.goto(
                    "http://httpbin.org/ip",
                    wait_until="domcontentloaded",
                    timeout=8000
                )
                ip_data = await check_page.evaluate('document.body.innerText')
                self.logger.info(f"[ProxyManager] Proxy health-check passed. Active IP: {ip_data.strip()}")
                return proxy
            except Exception as proxy_err:
                self.logger.warning(f"[ProxyManager] Proxy failed ({str(proxy_err)[:100]}). Trying next...")
            finally:
                if check_page and not check_page.is_closed():
                    try:
                        await check_page.context.close()
                    except Exception:
                        pass
                        
        self.logger.critical("[ProxyManager] ALL proxies failed. Falling back to direct connection.")
        browser_manager.set_proxy(None)
        return None
