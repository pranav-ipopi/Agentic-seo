import asyncio
import os
import random
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor

from seleniumbase import cdp_driver, sb_cdp
from playwright.async_api import async_playwright

import subprocess
import sys
import json

_cf_lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# Resource blocking
# ---------------------------------------------------------------------------
# NEVER block /cdn-cgi/* — CF routes challenge JS, Turnstile, and bot
# management scripts through that path. Only /cdn-cgi/rum is pure analytics.
#
# NEVER block resource type "other" — CF injects challenge scripts via CDP
# with type "other". Blocking it silently kills the Turnstile token.
#
# Blocked types: image, media, font  (images unblocked for captcha pages)
# ---------------------------------------------------------------------------

_BLOCKED_RESOURCE_TYPES = frozenset({"media"})

# Exact substrings — safer than glob patterns, no risk of matching /cdn-cgi/
_BLOCKED_URL_SUBSTRINGS = [
    "google-analytics.com/collect",
    "google-analytics.com/g/collect",
    "googletagmanager.com/gtag/js",
    "doubleclick.net/pagead",
    "facebook.net/tr",
    "hotjar.com/c/hotjar-",
    "sentry.io/api/",
    "/cdn-cgi/rum",   # exact path — safe, pure analytics beacon
]


def _should_block(request, allow_images: bool) -> bool:
    # Temporarily disabled image and font blocking because Cloudflare Turnstile 
    # uses these as strong signals for headless bot detection.
    # if not allow_images and request.resource_type == "image":
    #     return True
    if request.resource_type in _BLOCKED_RESOURCE_TYPES:
        return True
    url = request.url
    return any(sub in url for sub in _BLOCKED_URL_SUBSTRINGS)


# ---------------------------------------------------------------------------
# Cloudflare Turnstile bypass (Hardware Mouse Movement)
# ---------------------------------------------------------------------------

try:
    import pytweening
    _PYTWEENING_AVAILABLE = True
except ImportError:
    _PYTWEENING_AVAILABLE = False

def calculate_human_path(start: tuple, end: tuple, points_count: int = 35) -> list:
    """
    Generates a smooth, human-like curved mouse path between two coordinates.
    """
    start_x, start_y = start
    end_x, end_y = end

    # Random control point offset creates the natural arc / curve
    control_x = start_x + (end_x - start_x) * random.uniform(0.2, 0.8) + random.randint(-40, 40)
    control_y = start_y + (end_y - start_y) * random.uniform(0.2, 0.8) + random.randint(-40, 40)

    path = []
    for i in range(points_count):
        t = i / float(points_count - 1)

        # Ease in/out warping: accelerate then decelerate toward target
        if _PYTWEENING_AVAILABLE:
            t_eased = pytweening.easeInOutQuad(t)
        else:
            # Simple linear fallback — still better than an instant teleport
            t_eased = t

        # Quadratic Bezier formula: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
        x = (1 - t_eased) ** 2 * start_x + 2 * (1 - t_eased) * t_eased * control_x + t_eased ** 2 * end_x
        y = (1 - t_eased) ** 2 * start_y + 2 * (1 - t_eased) * t_eased * control_y + t_eased ** 2 * end_y
        path.append((int(x), int(y)))

    return path

async def move_mouse_humanlike(page, target_x: float, target_y: float) -> None:
    """
    Moves Playwright's mouse from a random starting position to the target
    coordinates along a curved Bezier path matching Fitts's Law.
    """
    import math
    
    current_x = random.randint(0, 120)
    current_y = random.randint(0, 120)

    # Calculate distance for Fitts's Law timing
    distance = math.sqrt((target_x - current_x)**2 + (target_y - current_y)**2)
    base_duration = max(0.2, 0.15 + (distance / 2000))
    duration = base_duration * random.uniform(0.8, 1.4)
    
    # Add cognitive start delay
    await asyncio.sleep(random.uniform(0.1, 0.3))

    path = calculate_human_path((current_x, current_y), (target_x, target_y))

    # Calculate delay per step based on total duration and point count
    step_delay = duration / len(path)

    for x, y in path:
        await page.mouse.move(x, y)
        await asyncio.sleep(max(0.001, step_delay * random.uniform(0.8, 1.2)))

    # Human tremor at destination (1-3px wiggle)
    for _ in range(random.randint(1, 3)):
        wiggle_x = target_x + random.randint(-2, 2)
        wiggle_y = target_y + random.randint(-2, 2)
        await page.mouse.move(wiggle_x, wiggle_y)
        await asyncio.sleep(random.uniform(0.02, 0.08))

    # Brief hover pause before pressing down
    await asyncio.sleep(random.uniform(0.2, 0.6))

async def handle_cloudflare_challenge(page, max_retries: int = 20) -> bool:
    """
    Tiered Cloudflare Turnstile bypass.
    Tier 1: Atomic locate-and-click pattern. PyAutoGUI (if Xvfb/headful) or CDP click with human-like mouse movement.
    Tier 2: Isolated SeleniumBase sb_cdp.solve_captcha() fallback.
    """
    print("Scanning page for Cloudflare verification boxes...")
    
    # Store URL and proxy for Tier 2 fallback
    target_url = page.url
    proxy_config = getattr(page.context, '_proxy_config', None)

    for attempt in range(max_retries):
        try:
            # --- Fast path: check if challenge already cleared ---
            title = await page.title()
            if "Just a moment" not in title and "Verify you are human" not in title and "cdn-cgi" not in page.url and "challenge" not in page.url:
                if attempt == 0:
                    print("No Cloudflare challenge detected — proceeding.")
                else:
                    print("Cloudflare challenge cleared. Continuing.")
                return True

            print(f"Cloudflare challenge active (attempt {attempt + 1}/{max_retries})...")

            # Atomic: locate → verify → click → verify, no gaps
            # Use page.frames to ensure we find nested iframes (page.locator only searches main frame)
            cf_frame = None
            for frame in page.frames:
                url = frame.url.lower()
                if "challenge-platform" in url or "turnstile" in url or "challenges.cloudflare.com" in url:
                    cf_frame = frame
                    break
                    
            if not cf_frame:
                # Fast visibility check failed
                await asyncio.sleep(0.5)
                continue
            
            async with _cf_lock:
                await page.bring_to_front()
                
                # Get fresh coordinates immediately without any sleep
                try:
                    turnstile = await cf_frame.frame_element()
                    box = await turnstile.bounding_box()
                except Exception as e:
                    if "Timeout" in str(e) or "TimeoutError" in type(e).__name__:
                        continue
                    raise e
                    
                if not box or box["width"] < 10:
                    continue

                # Map to absolute PyAutoGUI screen coordinates
                viewport = await page.evaluate("""() => {
                    return {
                        screenX: window.screenX,
                        screenY: window.screenY,
                        chromeHeight: window.outerHeight - window.innerHeight
                    }
                }""")

                # Calculate Playwright viewport coordinates
                click_x_vp = box["x"] + 30 + random.randint(-5, 5)
                click_y_vp = box["y"] + (box["height"] / 2) + random.randint(-3, 3)

                # Map to Absolute Screen coordinates for PyAutoGUI
                abs_x = click_x_vp + viewport["screenX"]
                abs_y = click_y_vp + viewport["screenY"] + viewport.get("chromeHeight", 80)

                print(f"Executing natural hover to coordinates VP X:{click_x_vp:.2f}, Y:{click_y_vp:.2f} (Abs X:{abs_x:.2f}, Y:{abs_y:.2f})...")

                click_success = False
                if os.environ.get("RUNNING_ON_VPS", "false").lower() == "true":
                    try:
                        import pyautogui
                        pyautogui.FAILSAFE = False
                        
                        if hasattr(pyautogui, '_pyautogui_x11'):
                            if getattr(pyautogui._pyautogui_x11, '_display', None) is None or isinstance(pyautogui._pyautogui_x11._display, str):
                                import Xlib.display
                                pyautogui._pyautogui_x11._display = Xlib.display.Display(os.environ.get('DISPLAY'))
                            
                        print(f"Executing PyAutoGUI click at Abs X:{abs_x:.2f}, Y:{abs_y:.2f}...")
                        
                        # Set a realistic starting position if it's currently at 0,0
                        current_x, current_y = pyautogui.position()
                        if current_x == 0 and current_y == 0:
                            pyautogui.moveTo(random.randint(100, 500), random.randint(100, 500))

                        distance = ((abs_x - pyautogui.position()[0])**2 + (abs_y - pyautogui.position()[1])**2) ** 0.5
                        duration = (0.15 + (distance / 2000)) * random.uniform(0.8, 1.4)
                        pyautogui.moveTo(abs_x, abs_y, duration=duration, tween=pyautogui.easeInOutQuad)
                        
                        # Wiggle
                        for _ in range(random.randint(1, 3)):
                            pyautogui.moveTo(abs_x + random.randint(-2, 2), abs_y + random.randint(-2, 2), duration=random.uniform(0.05, 0.1))
                            
                        pyautogui.click(clicks=1, interval=0.1)
                        click_success = True
                    except ImportError:
                        print("PyAutoGUI not installed, falling back to CDP click")
                    except Exception as e:
                        print(f"PyAutoGUI click failed: {e}, falling back to CDP click")

                if not click_success:
                    # Fallback to CDP click with human-like movement
                    await move_mouse_humanlike(page, click_x_vp, click_y_vp)
                    # CDP-level mouse dispatch
                    await page.mouse.down()
                    await asyncio.sleep(random.uniform(0.05, 0.15))
                    await page.mouse.up()
                
                print("Verification box clicked. Waiting for token processing...")

                # Quick verification
                await asyncio.sleep(0.5)
                
                # Verification polling loop
                for _ in range(10):
                    title = await page.title()
                    # Check URL and Title indicators
                    if "cdn-cgi" not in page.url and "challenge" not in page.url and "Just a moment" not in title and "Verify you are human" not in title and page.url != "about:blank":
                        print("Tier 1: Cloudflare challenge cleared.")
                        return True
                        
                    await asyncio.sleep(1)

        except Exception as e:
            if "detached" in str(e).lower() or "closed" in str(e).lower() or "destroyed" in str(e).lower() or "target page" in str(e).lower():
                print("Transient detachment error. Re-evaluating challenge status...")
                await asyncio.sleep(0.5)
                continue
            # Transient Playwright error — keep polling
            print(f"Transient error during challenge check: {str(e).splitlines()[0]}")
            continue

        await asyncio.sleep(0.5)

    print("Tier 1 failed. Escalating to Tier 2 (SeleniumBase solve_captcha fallback)...")
    
    try:
        loop = asyncio.get_running_loop()
        proxy_url = proxy_config['server'] if proxy_config and 'server' in proxy_config else None
        
        def _sync_solve(url, proxy):
            print(f"[Tier 2] Spawning isolated sb_cdp Chrome via subprocess for {url}")
            
            script = f"""
from seleniumbase import SB
import json
import sys

try:
    with SB(uc=True, headless=True, proxy="{proxy if proxy else ''}") as sb:
        sb.activate_cdp_mode()
        sb.get("{url}")
        sb.sleep(2)
        sb.solve_captcha()
        sb.sleep(2)
        cookies = sb.get_cookies()
        cf = next((c for c in cookies if c.get('name') == 'cf_clearance'), None)
        print(json.dumps({{"status": "success", "cf_clearance": cf, "cookies": cookies}}))
except Exception as e:
    print(json.dumps({{"status": "error", "message": str(e)}}))
    sys.exit(1)
"""
            try:
                result = subprocess.run(
                    [sys.executable, "-c", script],
                    capture_output=True,
                    text=True,
                    timeout=90
                )
            except subprocess.TimeoutExpired:
                print(f"[Tier 2] Subprocess completely timed out after 90s. Process tree killed.")
                return None
            
            if result.returncode != 0:
                print(f"[Tier 2] Subprocess failed with code {result.returncode}. Stdout: {result.stdout.strip()} | Stderr: {result.stderr.strip()}")
                return None
                
            try:
                data = json.loads(result.stdout)
                if data.get("status") == "success":
                    return data.get("cookies", [])
            except json.JSONDecodeError:
                print(f"[Tier 2] Failed to parse subprocess output: {result.stdout}")
                
            return None
                
        # Run the subprocess block in the default threadpool executor (it's completely isolated from asyncio)
        cookies = await loop.run_in_executor(None, _sync_solve, target_url, proxy_url)
        
        if cookies:
            print("[Tier 2] Harvested cookies, injecting into Playwright context...")
            await page.context.add_cookies(cookies)
            
            # Tier 0: Cache the harvested cf_clearance cookie for this proxy + domain
            if proxy_config and proxy_config.get('server'):
                proxy_url = proxy_config['server']
                # Try to extract domain from target URL
                parsed = urlparse(target_url)
                domain = parsed.hostname
                
                # Find cf_clearance cookie
                cf_cookie = None
                for cookie in cookies:
                    if cookie.get('name') == 'cf_clearance':
                        cf_cookie = cookie
                        break
                        
                if cf_cookie and domain:
                    # In python 3.10+ we can access the ProxyManager via the class
                    manager = getattr(page.context, '_proxy_manager', None)
                    user_agent = getattr(page.context, '_user_agent', None)
                    if manager and user_agent:
                        manager.set_cf_clearance(proxy_url, cf_cookie, user_agent)

            # Reload page to apply cookies
            await page.reload(wait_until="commit")
            return True
            
    except Exception as e:
        print(f"[Tier 2] Fallback failed: {e}")

    print("Warning: Cloudflare challenge bypass failed on both tiers.")
    return False


# ---------------------------------------------------------------------------
# StealthBrowserManager
# ---------------------------------------------------------------------------

class StealthBrowserManager:
    """
    Manages an undetected Chromium session (SeleniumBase CDP) with Playwright.

    Each call to get_page() / get_captcha_page() returns a page inside a
    FRESH isolated context. The caller must close the context when done:

        finally:
            if page and not page.is_closed():
                await page.context.close()

    Fresh contexts prevent Cloudflare from correlating the same browser
    fingerprint across different target sites in the same job batch.
    """

    def __init__(self):
        self.driver = None
        self._playwright_context_manager = None
        self.playwright = None
        self.browser = None
        self._proxy_url: str | None = None
        self.vdisplay = None
        # Tier 0 support
        self._proxy_manager = None

    def set_proxy(self, proxy_url: str | None, proxy_manager=None):
        self._proxy_url = proxy_url
        self._proxy_manager = proxy_manager

    async def start(self):
        print("Starting Stealth Browser (SeleniumBase CDP)...")
        # We start with None. ProxyManager will inject the active proxy later via set_proxy()
        self._proxy_url = None
        print("Stealth browser started. Proxy status depends on ProxyManager injection.")

        chrome_args = [
            "--disable-blink-features=AutomationControlled",
            "--start-maximized",
            "--window-size=1920,1080",
            "--disable-component-update",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-site-isolation-trials",
        ]

        # Use environment variable to determine if running on VPS and spin up virtual display if needed
        running_on_vps = os.getenv("RUNNING_ON_VPS", "false").lower() in ("true", "1")
        if running_on_vps:
            try:
                from xvfbwrapper import Xvfb
                self.vdisplay = Xvfb(width=1920, height=1080, colordepth=24)
                self.vdisplay.start()
                os.environ['DISPLAY'] = self.vdisplay.new_display
                print(f"Started Xvfb virtual display on {os.environ['DISPLAY']}")
            except ImportError:
                print("Warning: xvfbwrapper not installed. Browser will run without virtual display.")
            except Exception as e:
                print(f"Warning: Failed to start Xvfb: {e}")

            chrome_args.extend([
                "--use-gl=angle",
                "--use-angle=gl",
            ])

        try:
            self.driver = await cdp_driver.start_async(browser_args=chrome_args)
        except Exception as e:
            print(f"Failed to start CDP driver, retrying... Error: {e}")
            await asyncio.sleep(2)
            self.driver = await cdp_driver.start_async(browser_args=chrome_args)
            
        endpoint_url = self.driver.get_endpoint_url()
        print(f"CDP Endpoint URL: {endpoint_url}")

        self._playwright_context_manager = async_playwright()
        self.playwright = await self._playwright_context_manager.__aenter__()
        self.browser = await self.playwright.chromium.connect_over_cdp(endpoint_url)
        print("Playwright connected to stealth browser.")
        return self.browser

    def _build_proxy_dict(self) -> dict | None:
        if not self._proxy_url:
            return None
        
        url = self._proxy_url
        
        # Determine scheme
        scheme = 'http'
        if url.startswith('https://'):
            scheme = 'https'
            core = url[8:]
        elif url.startswith('http://'):
            scheme = 'http'
            core = url[7:]
        elif url.startswith('socks5://'):
            scheme = 'socks5'
            core = url[9:]
        elif url.startswith('socks4://'):
            scheme = 'socks4'
            core = url[9:]
        else:
            # Default to http if no scheme provided
            scheme = 'http'
            core = url
            url = f"http://{url}"
            
        if '@' in core:
            parsed = urlparse(url)
            if parsed.username and parsed.password:
                return {
                    "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}",
                    "username": parsed.username,
                    "password": parsed.password,
                }
            return {"server": url}
        
        parts = core.split(':')
        if len(parts) >= 4:
            host = parts[0]
            port = parts[1]
            user = parts[2]
            password = ':'.join(parts[3:])
            return {
                "server": f"{scheme}://{host}:{port}",
                "username": user,
                "password": password,
            }
            
        return {"server": url}

    async def _new_context(self, allow_images: bool = True):
        if not self.browser:
            raise RuntimeError("Browser not started. Call start() first.")

        proxy_dict = self._build_proxy_dict()
        
        # Tier 0: Get User-Agent bound to this proxy
        user_agent = None
        if self._proxy_manager and self._proxy_url:
            user_agent = self._proxy_manager.get_user_agent(self._proxy_url)
        
        context_options = {
            "viewport": {"width": 1920, "height": 1080},
            "proxy": proxy_dict,
            "ignore_https_errors": True,
        }
        if user_agent:
            context_options["user_agent"] = user_agent
            
        context = await self.browser.new_context(**context_options)
        
        # Store proxy config on context for Tier 2 fallback to use
        context._proxy_config = proxy_dict
        context._proxy_manager = self._proxy_manager
        context._user_agent = user_agent
        
        # Tier 0: Inject all active cf_clearance cookies for this proxy (scoped by domain)
        if self._proxy_manager and self._proxy_url:
            # We don't have the exact target url here yet, but get_all_cf_clearance is safe to return all 
            # as Playwright contexts internally map and scope injected cookies correctly. We will pass a dummy
            # since get_all_cf_clearance takes an optional target_url, or we can just fetch all of them.
            cf_cookies = self._proxy_manager.get_all_cf_clearance(self._proxy_url)
            if cf_cookies:
                print(f"[Tier 0] Injecting {len(cf_cookies)} valid cf_clearance cookie(s) for proxy {self._proxy_url}")
                await context.add_cookies(cf_cookies)

        allow = allow_images

        # P2: WebGL Mocking Injection
        await context.add_init_script("""
            // WebGL fingerprint hardening
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                // Return realistic vendor/renderer strings
                if (parameter === 37445) return "Intel Inc.";  // UNMASKED_VENDOR_WEBGL
                if (parameter === 37446) return "Intel Iris OpenGL Engine";  // UNMASKED_RENDERER_WEBGL
                return getParameter(parameter);
            };
            
            // Ensure canvas fingerprint is consistent
            const toDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function(type) {
                if (type === 'image/png' && this.width > 16 && this.height > 16) {
                    // Add subtle noise to prevent static fingerprinting
                    const ctx = this.getContext('2d');
                    if (ctx) {
                        const imageData = ctx.getImageData(0, 0, this.width, this.height);
                        const data = imageData.data;
                        // Modify 1 random pixel's alpha by 1 (invisible, breaks hash consistency)
                        const idx = Math.floor(Math.random() * data.length / 4) * 4 + 3;
                        data[idx] = (data[idx] + 1) % 256;
                        ctx.putImageData(imageData, 0, 0);
                    }
                }
                return toDataURL.apply(this, arguments);
            };
        """)

        async def route_handler(route):
            if _should_block(route.request, allow_images=allow):
                await route.abort()
            else:
                await route.continue_()

        await context.route("**/*", route_handler)
        return context

    async def get_page(self):
        """Fresh isolated context, images allowed to pass Cloudflare. Close via page.context.close()."""
        context = await self._new_context(allow_images=True)
        return await context.new_page()

    async def get_captcha_page(self):
        """Fresh isolated context, images allowed (SolvMedia needs them)."""
        context = await self._new_context(allow_images=True)
        return await context.new_page()

    async def close(self):
        for obj, name in [(self.browser, "browser"),
                          (self._playwright_context_manager, "playwright"),
                          (self.driver, "cdp_driver")]:
            if not obj:
                continue
            try:
                if name == "playwright":
                    await obj.__aexit__(None, None, None)
                elif name == "cdp_driver":
                    obj.quit()
                else:
                    await obj.close()
            except Exception as e:
                print(f"Error closing {name}: {e}")
                
        if self.vdisplay:
            try:
                self.vdisplay.stop()
            except Exception as e:
                print(f"Error stopping Xvfb: {e}")
                
        print("Stealth Browser closed.")