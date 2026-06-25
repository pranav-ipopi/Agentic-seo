import os
import random
import logging
import time

class ProxyManager:
    def __init__(self, logger=None):
        self.logger = logger or logging.getLogger(__name__)
        self.primary_proxies = []
        self.fallback_proxies = []
        # Tier 0: proxy -> {"user_agent": str, "cookies": {domain: {"cookie": dict, "expires": float}}}
        self.cookie_pool = {}
        self.load_proxies()

    def load_proxies(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        primary_path = os.path.join(base_dir, 'configs', 'proxies.txt')
        fallback_path = os.path.join(base_dir, 'configs', '2captcha_proxies.txt')
        
        # Load from .env if present (legacy support)
        env_proxy = os.getenv("PROXY_URL")
        if env_proxy:
            self.primary_proxies.append(env_proxy.strip())
            
        if os.path.exists(primary_path):
            with open(primary_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if not line.startswith(('http://', 'https://', 'socks')):
                            line = f'http://{line}'
                            
                        # Handle port ranges like gw.dataimpulse.com:10000-10050
                        port_part = line.split(":")[-1]
                        if "-" in port_part and port_part.replace("-", "").isdigit():
                            base_url, port_range = line.rsplit(":", 1)
                            start_port, end_port = map(int, port_range.split("-"))
                            for port in range(start_port, end_port + 1):
                                proxy_str = f"{base_url}:{port}"
                                if proxy_str not in self.primary_proxies:
                                    self.primary_proxies.append(proxy_str)
                        else:
                            if line not in self.primary_proxies:
                                self.primary_proxies.append(line)
                            
        if os.path.exists(fallback_path):
            with open(fallback_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        if not line.startswith(('http://', 'https://', 'socks')):
                            line = f'http://{line}'
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
            browser_manager.set_proxy(proxy, proxy_manager=self)
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
                err_str = str(proxy_err)
                if "ERR_INVALID_AUTH_CREDENTIALS" in err_str or "407 Proxy Authentication Required" in err_str:
                    di_login = os.getenv("DATAIMPULSE_LOGIN")
                    di_pass = os.getenv("DATAIMPULSE_PASSWORD")
                    if di_login and di_pass and "@" not in proxy:
                        self.logger.info(f"[ProxyManager] IP Whitelist rejected. Falling back to credentials for {proxy}...")
                        scheme, rest = proxy.split("://", 1)
                        auth_proxy = f"{scheme}://{di_login}:{di_pass}@{rest}"
                        
                        # Close the failed context and retry with authenticated proxy
                        if check_page and not check_page.is_closed():
                            try:
                                await check_page.context.close()
                            except Exception:
                                pass
                                
                        browser_manager.set_proxy(auth_proxy, proxy_manager=self)
                        try:
                            check_page = await browser_manager.get_page()
                            await check_page.goto("http://httpbin.org/ip", wait_until="domcontentloaded", timeout=8000)
                            ip_data = await check_page.evaluate('document.body.innerText')
                            self.logger.info(f"[ProxyManager] Fallback auth passed! Active IP: {ip_data.strip()}")
                            return auth_proxy
                        except Exception as fallback_err:
                            self.logger.warning(f"[ProxyManager] Fallback auth also failed: {str(fallback_err)[:100]}")
                            
                self.logger.warning(f"[ProxyManager] Proxy failed ({err_str[:100]}). Trying next...")
            finally:
                if check_page and not check_page.is_closed():
                    try:
                        await check_page.context.close()
                    except Exception:
                        pass
                        
        self.logger.critical("[ProxyManager] ALL proxies failed. Falling back to direct connection.")
        browser_manager.set_proxy(None)
        return None
        
    # -----------------------------------------------------------------------
    # Tier 0: cf_clearance Cookie Reuse Methods
    # -----------------------------------------------------------------------
    
    def get_all_cf_clearance(self, proxy: str, target_url: str = None) -> list:
        """Returns all active cf_clearance cookies for a proxy, optionally scoped to a target URL."""
        if proxy not in self.cookie_pool:
            return []
            
        valid_cookies = []
        now = time.time()
        
        target_domain = None
        if target_url:
            from urllib.parse import urlparse
            target_domain = urlparse(target_url).hostname
            if target_domain and target_domain.startswith("www."):
                target_domain = target_domain[4:]
                
        for domain in list(self.cookie_pool[proxy]["cookies"].keys()):
            data = self.cookie_pool[proxy]["cookies"][domain]
            # 5-minute buffer (300s) to prevent mid-session expiry
            if now > (data["expires"] - 300):
                self.logger.info(f"[Tier 0] cf_clearance cookie expired for domain {domain} on proxy {proxy}")
                del self.cookie_pool[proxy]["cookies"][domain]
            else:
                if target_domain:
                    cookie_domain = data["cookie"].get("domain", "")
                    if target_domain == cookie_domain or target_domain.endswith(cookie_domain.lstrip(".")):
                        valid_cookies.append(data["cookie"])
                else:
                    valid_cookies.append(data["cookie"])
                
        return valid_cookies
        
    def get_user_agent(self, proxy: str) -> str:
        """
        Returns a consistent User-Agent for a given proxy to ensure cf_clearance 
        bindings remain valid across contexts.
        """
        # If we already have one tied to this proxy in the pool, use it
        if proxy in self.cookie_pool and "user_agent" in self.cookie_pool[proxy]:
            return self.cookie_pool[proxy]["user_agent"]
            
        # Default modern User-Agent
        return (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
        
    def set_cf_clearance(self, proxy: str, cookie: dict, user_agent: str, ttl_seconds: int = 1800):
        """Stores a harvested cf_clearance cookie for future reuse."""
        if not cookie or cookie.get("name") != "cf_clearance":
            return
            
        domain = cookie.get("domain")
        if not domain:
            return
            
        if proxy not in self.cookie_pool:
            self.cookie_pool[proxy] = {"user_agent": user_agent, "cookies": {}}
            
        self.logger.info(f"[Tier 0] Storing cf_clearance for domain {domain} on proxy {proxy}, expires in {ttl_seconds}s")
        self.cookie_pool[proxy]["cookies"][domain] = {
            "cookie": cookie,
            "expires": time.time() + ttl_seconds
        }
        
    def invalidate_cf_clearance(self, proxy: str, domain: str):
        """Invalidates the cookie when a block is detected."""
        if proxy in self.cookie_pool and domain in self.cookie_pool[proxy]["cookies"]:
            self.logger.warning(f"[Tier 0] Invalidating cf_clearance for domain {domain} on proxy {proxy} due to block")
            del self.cookie_pool[proxy]["cookies"][domain]
