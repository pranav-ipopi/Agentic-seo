import asyncio
import os
import random
from urllib.parse import urlparse
from seleniumbase import cdp_driver
from playwright.async_api import async_playwright

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
    coordinates along a curved Bezier path with per-step micro-delays.
    """
    # Start from a random position in the upper-left quadrant of the page
    current_x = random.randint(0, 120)
    current_y = random.randint(0, 120)

    path = calculate_human_path((current_x, current_y), (target_x, target_y))

    for x, y in path:
        await page.mouse.move(x, y)
        # Micro-delay simulates physical muscle tremors (4–12 ms per step)
        await asyncio.sleep(random.uniform(0.004, 0.012))

    # Brief hover pause before pressing down — mirrors natural hand hesitation
    await asyncio.sleep(random.uniform(0.2, 0.6))

async def handle_cloudflare_challenge(page, max_retries: int = 15) -> bool:
    """
    Enhanced Cloudflare Turnstile bypass with human-like mouse movement.
    """
    print("Scanning page for Cloudflare verification boxes...")

    for attempt in range(max_retries):
        try:
            # --- Check for a manual Turnstile iframe (searches all nested frames) ---
            cf_frame = None
            for frame in page.frames:
                url = frame.url.lower()
                if "challenge-platform" in url or "turnstile" in url or "challenges.cloudflare.com" in url:
                    cf_frame = frame
                    break

            # --- Fast path: check if challenge already cleared ---
            title = await page.title()
            if not cf_frame and "Just a moment" not in title and "Verify you are human" not in title:
                if attempt == 0:
                    print("No Cloudflare challenge detected — proceeding.")
                else:
                    print("Cloudflare challenge cleared. Continuing.")
                return True

            print(f"Cloudflare challenge active (attempt {attempt + 1}/{max_retries})...")


            if cf_frame:
                async with _cf_lock:
                    await page.bring_to_front()
                    print("Cloudflare manual verification detected! Executing human-mouse bypass...")

                    # Allow up to 5 s for the iframe to fully render its contents
                    await asyncio.sleep(5.0)

                    # Retrieve the iframe's DOM element handle directly from the Frame object
                    iframe_element = await cf_frame.frame_element()

                    if await iframe_element.is_visible():
                        # Retrieve the bounding box parameters of the Turnstile iframe directly
                        box = await iframe_element.bounding_box()

                        if box:
                            # Calculate the checkbox position (typically near the left side)
                            click_x = box["x"] + 30 + random.randint(-5, 5)
                            click_y = box["y"] + (box["height"] / 2) + random.randint(-3, 3)

                            print(f"Executing natural hover to coordinates X:{click_x:.2f}, Y:{click_y:.2f}...")

                            # Move the mouse along a natural curved path
                            await move_mouse_humanlike(page, click_x, click_y)

                            # Click with a randomised hold duration (50–150 ms)
                            await page.mouse.click(
                                click_x,
                                click_y,
                                delay=random.uniform(50, 150)
                            )
                            print("Verification box clicked. Waiting for token processing...")

                        # Give Cloudflare time to validate the click and redirect
                        await asyncio.sleep(4)

                        # Re-check title to confirm bypass succeeded
                        title_after = await page.title()
                        if "Just a moment" not in title_after and "Verify you are human" not in title_after:
                            print("Cloudflare challenge cleared after manual click.")
                            return True
                    else:
                        print("Could not get bounding box for Turnstile widget.")

        except Exception as e:
            if "Execution context was destroyed" in str(e):
                # Page navigated away — Cloudflare check passed
                print("Navigation detected — Cloudflare challenge cleared.")
                await page.wait_for_timeout(2000)
                return True
            # Timeout or other transient Playwright error — keep polling
            print(f"No manual interaction required or page auto-verified successfully.")
            return True

        await page.wait_for_timeout(1000)

    print("Warning: Cloudflare challenge may still be active, but continuing anyway.")
    return False


# ---------------------------------------------------------------------------
# StealthBrowserManager
# ---------------------------------------------------------------------------

class StealthBrowserManager:
    """
    Manages an undetected Chromium session (SeleniumBase CDP) with Playwright.

    Each call to get_page() returns a page inside a
    FRESH isolated context, optionally loading a storage state (cookies/local storage).
    The caller must close the context when done:

        finally:
            if page and not page.is_closed():
                await page.context.close()
    """

    def __init__(self):
        self.driver = None
        self._playwright_context_manager = None
        self.playwright = None
        self.browser = None
        self._proxy_url: str | None = None

    async def start(self):
        print("Starting Stealth Browser (SeleniumBase CDP)...")
        use_proxy = os.getenv("USE_PROXY", "false").lower() == "true"
        self._proxy_url = os.getenv("PROXY_URL") if use_proxy else None
        print("Proxy enabled." if self._proxy_url else "Running without proxy.")

        chrome_args = [
            "--disable-blink-features=AutomationControlled",
            "--start-maximized",
            "--window-size=1920,1080",
            "--disable-component-update",
            "--no-sandbox",
        ]

        # Use environment variable to determine if running on VPS (or default to true on linux)
        running_on_vps = os.getenv("RUNNING_ON_VPS", str(os.name == "posix")).lower() in ("true", "1")
        if running_on_vps:
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
        parsed = urlparse(self._proxy_url)
        if parsed.username and parsed.password:
            return {
                "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}",
                "username": parsed.username,
                "password": parsed.password,
            }
        return {"server": self._proxy_url}

    async def _new_context(self, allow_images: bool = True, storage_state_path: str = None):
        if not self.browser:
            raise RuntimeError("Browser not started. Call start() first.")

        context_kwargs = {
            "viewport": {"width": 1920, "height": 1080},
            "proxy": self._build_proxy_dict(),
        }
        
        if storage_state_path and os.path.exists(storage_state_path):
            context_kwargs["storage_state"] = storage_state_path

        context = await self.browser.new_context(**context_kwargs)

        allow = allow_images

        async def route_handler(route):
            if _should_block(route.request, allow_images=allow):
                await route.abort()
            else:
                await route.continue_()

        await context.route("**/*", route_handler)
        return context

    async def get_page(self, storage_state_path: str = None):
        """Fresh isolated context, optionally with storage state. Close via page.context.close()."""
        context = await self._new_context(allow_images=True, storage_state_path=storage_state_path)
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
        print("Stealth Browser closed.")
