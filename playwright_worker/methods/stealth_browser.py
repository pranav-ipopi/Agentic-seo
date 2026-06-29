import asyncio
import os
import random
from urllib.parse import urlparse
from seleniumbase import Driver
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
# StealthBrowserManager (CDP Bridge - 1 Profile Test)
# ---------------------------------------------------------------------------

import subprocess
import time
import urllib.request
from enum import Enum

class WorkerState(Enum):
    IDLE = "IDLE"
    BUSY = "BUSY"
    COOLDOWN = "COOLDOWN"
    RESTARTING = "RESTARTING"
    BROKEN = "BROKEN"


class BrowserWorker:
    """
    Owns one persistent profile, one Chrome instance, one CDP port, and one Playwright connection.
    """
    def __init__(self, worker_id: str, cdp_port: int, profile_dir: str):
        self.worker_id = worker_id
        self.cdp_port = cdp_port
        self.profile_dir = profile_dir
        self.state = WorkerState.RESTARTING
        
        self.jobs_completed = 0
        self.jobs_failed = 0
        self.captchas = 0
        self.last_used = time.time()
        self.uptime_start = time.time()
        self.restart_count = 0
        
        self.chrome_process = None
        self._playwright_context_manager = None
        self.playwright = None
        self.browser = None
        self.page = None
        self._proxy_url = None

    def set_proxy(self, proxy_url: str | None):
        self._proxy_url = proxy_url

    async def _launch_chrome(self):
        """Fire-and-forget launch of the persistent Chrome clone."""
        try:
            # Check if already running by pinging the CDP endpoint
            await asyncio.to_thread(urllib.request.urlopen, f"http://localhost:{self.cdp_port}/json/version", timeout=1)
            print(f"[Worker {self.worker_id}] Chrome already running on port {self.cdp_port}")
            return
        except Exception:
            pass # Not running, let's launch it
            
        chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        
        # Clear lock files so Chrome doesn't think it crashed or is in use
        for lock in ["SingletonLock", "SingletonCookie", "SingletonSocket"]:
            lock_path = os.path.join(self.profile_dir, lock)
            if os.path.exists(lock_path):
                try:
                    os.remove(lock_path)
                except:
                    pass
                    
        args = [
            f"--remote-debugging-port={self.cdp_port}",
            f"--user-data-dir={self.profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "--restore-last-session",
            "--start-maximized",
        ]
        
        # Using cmd /c start detaches the process completely, making explorer.exe the parent.
        # This scrubs Python environment variables and looks like a native user click.
        cmd_str = f'cmd.exe /c start "" "{chrome_path}" ' + " ".join(args)
        subprocess.Popen(cmd_str, shell=True)
        print(f"[Worker {self.worker_id}] Launched Chrome process on port {self.cdp_port} via explorer")

    async def start(self):
        """Starts Chrome and connects Playwright via CDP."""
        self.state = WorkerState.RESTARTING
        await self._launch_chrome()
        
        endpoint_url = f"http://localhost:{self.cdp_port}"
        
        self._playwright_context_manager = async_playwright()
        self.playwright = await self._playwright_context_manager.__aenter__()
        
        # Give Chrome a second to bind the port if it was just launched
        for _ in range(10):
            try:
                self.browser = await self.playwright.chromium.connect_over_cdp(endpoint_url)
                print(f"[Worker {self.worker_id}] Playwright connected via CDP on port {self.cdp_port}.")
                break
            except Exception:
                await asyncio.sleep(1)
        else:
            self.state = WorkerState.BROKEN
            raise RuntimeError(f"[Worker {self.worker_id}] Failed to connect to CDP port {self.cdp_port}")

        self.state = WorkerState.IDLE
        self.uptime_start = time.time()

    async def get_page(self):
        """Returns a new page from the persistent default context."""
        if not self.browser or not self.browser.is_connected() or len(self.browser.contexts) == 0:
            print(f"[Worker {self.worker_id}] Browser disconnected or crashed. Restarting...")
            await self.restart()
            
        if not self.browser or len(self.browser.contexts) == 0:
            raise RuntimeError("Browser failed to restart properly.")
        
        if not self.page or self.page.is_closed():
            context = self.browser.contexts[0]
            self.page = await context.new_page()
            
            async def route_handler(route):
                if _should_block(route.request, allow_images=True):
                    await route.abort()
                else:
                    await route.continue_()
            try:
                await context.route("**/*", route_handler)
            except Exception:
                pass
                
        return self.page

    async def execute_job(self, target_url: str, job_coroutine_fn):
        """
        Executes a job logic passed as a coroutine function.
        Handles state transitions: BUSY -> run job -> clean up -> COOLDOWN -> IDLE
        """
        # Note: Worker state was set to BUSY optimistically by the pool before this call.
        self.last_used = time.time()
        
        try:
            page = await self.get_page()
            
            if target_url:
                print(f"[Worker {self.worker_id}] Navigating to {target_url}...")
                await page.goto(target_url, timeout=30000)
                await asyncio.sleep(3)
                cleared = await handle_cloudflare_challenge(page)
                if not cleared:
                    self.captchas += 1
            
            # Execute the actual Playwright logic using the injected coroutine factory
            result = await job_coroutine_fn(page)
            
            self.jobs_completed += 1
            return result
        except Exception as e:
            self.jobs_failed += 1
            print(f"[Worker {self.worker_id}] Job failed: {e}")
            raise e
        finally:
            # We DO NOT close the browser context, as it belongs to the persistent Chrome!
            # We just close the page we opened to free up memory.
            if self.page and not self.page.is_closed():
                try:
                    await self.page.close()
                except Exception:
                    pass
            self.page = None
            
            self.state = WorkerState.COOLDOWN
            # Small cooldown before picking up next job
            await asyncio.sleep(2)
            
            # Restart browser every 300 jobs or 4 hours
            if self.jobs_completed >= 300 or (time.time() - self.uptime_start) > 4 * 3600:
                print(f"[Worker {self.worker_id}] Job limit or uptime reached. Restarting Chrome...")
                await self.restart()
            else:
                self.state = WorkerState.IDLE

    async def restart(self):
        """Restarts the Chrome instance and reconnects Playwright."""
        self.state = WorkerState.RESTARTING
        self.restart_count += 1
        
        await self.close()
        
        # Hard kill by finding the PID listening on our CDP port
        try:
            output = subprocess.check_output(f'netstat -ano | findstr :{self.cdp_port}', shell=True).decode()
            for line in output.splitlines():
                if 'LISTENING' in line:
                    pid = line.strip().split()[-1]
                    if pid.isdigit() and pid != '0':
                        subprocess.run(f'taskkill /F /PID {pid}', shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        break
        except Exception:
            pass
                
        await asyncio.sleep(3)
        try:
            self.jobs_completed = 0
            await self.start()
        except Exception as e:
            print(f"[Worker {self.worker_id}] Restart failed: {e}")
            self.state = WorkerState.BROKEN

    async def close(self):
        """Disconnects Playwright and closes the page, but doesn't necessarily kill Chrome."""
        try:
            if self.page and not self.page.is_closed():
                await self.page.close()
        except Exception:
            pass
        try:
            if self.browser:
                await self.browser.close() # This disconnects CDP, doesn't kill Chrome
        except Exception:
            pass
        try:
            if self._playwright_context_manager:
                await self._playwright_context_manager.__aexit__(None, None, None)
        except Exception:
            pass
        self.browser = None
        self._playwright_context_manager = None
        self.playwright = None


class BrowserWorkerPool:
    """
    Maintains all workers and their lifecycle.
    """
    def __init__(self, max_profiles: int = 4):
        self.workers = []
        self.max_profiles = max_profiles
        self.base_dir = os.environ.get("PROFILE_BASE_DIR", r"C:\Users\HP\Documents\Agentic_SEO\playwright_worker\chrome_profiles")
        self._is_started = False
        
    async def start_all(self):
        """Initializes and starts all persistent workers concurrently."""
        if self._is_started:
            return
            
        print(f"[WorkerPool] Initializing {self.max_profiles} persistent workers...")
        tasks = []
        for i in range(1, self.max_profiles + 1):
            worker_id = f"{i:03d}"
            cdp_port = 9220 + i
            profile_dir = os.path.join(self.base_dir, f"profile_{worker_id}")
            
            worker = BrowserWorker(worker_id, cdp_port, profile_dir)
            self.workers.append(worker)
            tasks.append(worker.start())
            
        # Start all workers concurrently
        await asyncio.gather(*tasks, return_exceptions=True)
        print(f"[WorkerPool] All {self.max_profiles} workers initialized.")
        
        self._is_started = True
        
        # Start background health monitor
        asyncio.create_task(self._health_monitor())
        
    async def get_idle_worker(self) -> BrowserWorker:
        """Blocks until an idle worker is available and returns it."""
        while True:
            idle_workers = [w for w in self.workers if w.state == WorkerState.IDLE]
            if idle_workers:
                # Get the least recently used worker to distribute load
                idle_workers.sort(key=lambda w: w.last_used)
                worker = idle_workers[0]
                # Optimistically lock it (execute_job will also set it, but we do it here to prevent races)
                worker.state = WorkerState.BUSY 
                return worker
            await asyncio.sleep(1)

    async def _health_monitor(self):
        """Runs every minute to check health of workers."""
        while True:
            await asyncio.sleep(60)
            for worker in self.workers:
                if worker.state == WorkerState.BROKEN:
                    print(f"[WorkerPool] Attempting to recover broken worker {worker.worker_id}...")
                    asyncio.create_task(worker.restart())
                
                # Check for workers stuck in BUSY for more than 15 minutes
                elif worker.state == WorkerState.BUSY and (time.time() - worker.last_used) > 900:
                    print(f"[WorkerPool] Worker {worker.worker_id} seems stuck in BUSY. Forcing restart...")
                    asyncio.create_task(worker.restart())
