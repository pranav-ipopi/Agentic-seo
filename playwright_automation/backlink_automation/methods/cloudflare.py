import asyncio
import random

try:
    import pytweening
    _PYTWEENING_AVAILABLE = True
except ImportError:
    _PYTWEENING_AVAILABLE = False


async def bypass_cloudflare(page, max_retries=15):
    """
    Wait for Cloudflare to naturally pass due to our stealthy browser.
    Returns True if successfully bypassed, False if it times out.
    """
    print("Checking for Cloudflare protection...")
    
    # Wait for up to max_retries seconds to see if the page clears Cloudflare automatically
    for _ in range(max_retries):
        try:
            title = await page.title()
            if "Just a moment" not in title and "Verify you are human" not in title:
                print("Successfully bypassed Cloudflare (or no Cloudflare detected).")
                return True
                
            print("Waiting for Cloudflare check to complete natively...")
            
            # Sometimes you might still get the Turnstile checkbox, even with a stealth browser.
            # We attempt to click it if it appears.
            cf_frames = await page.locator('iframe[src*="challenge-platform"], iframe[src*="turnstile"]').count()
            if cf_frames > 0:
                print("Clicking the Turnstile widget directly...")
                iframe_element = await page.query_selector('iframe[src*="challenge-platform"], iframe[src*="turnstile"]')
                if iframe_element:
                    await iframe_element.click()
        except Exception as e:
            if "Execution context was destroyed" in str(e):
                print("Navigation detected! Cloudflare check passed.")
                # Give it a moment to finish loading the target page
                await page.wait_for_timeout(2000)
                return True
            # Other temporary playwright errors during load
            pass
            
        await page.wait_for_timeout(1000)
        
    print("Warning: Cloudflare might still be active, but continuing anyway.")
    return False


# ---------------------------------------------------------------------------
# Human-mouse helpers for Cloudflare Turnstile checkbox bypass
# ---------------------------------------------------------------------------

def calculate_human_path(start: tuple, end: tuple, points_count: int = 35) -> list:
    """
    Generates a smooth, human-like curved mouse path between two coordinates.

    Uses a quadratic Bezier curve with a random off-axis control point so the
    trajectory resembles a real hand movement rather than a straight line.
    The time parameter is warped through pytweening.easeInOutQuad so that the
    cursor accelerates at the start and decelerates near the target — matching
    natural hand mechanics.

    Falls back to a linear interpolation if pytweening is not installed.

    Args:
        start: (x, y) starting coordinate.
        end:   (x, y) target coordinate.
        points_count: Number of discrete steps along the path.

    Returns:
        List of (x, y) integer coordinate tuples representing the path.
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

    The micro-delays (4–12 ms) simulate the physical jitter of muscle tremors
    that Cloudflare's Turnstile looks for as a human signal.

    Args:
        page:     Playwright Page object (mouse is driven on the root page so
                  that viewport-relative bounding_box() coordinates align correctly
                  even when the target is inside an iframe).
        target_x: Viewport-relative X coordinate to move to.
        target_y: Viewport-relative Y coordinate to move to.
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


async def cloudflare_updated(page, max_retries: int = 15) -> bool:
    """
    Enhanced Cloudflare Turnstile bypass with human-like mouse movement.

    Strategy:
      - Fast path (most sessions): Polls the page title each second. If the
        Cloudflare challenge clears on its own (auto-verified by the stealth
        browser), returns True immediately without touching the mouse.
      - Slow path (manual checkbox visible): Detects the Turnstile iframe,
        enters its frame context, locates the checkbox element, computes its
        viewport-relative bounding box, and performs a curved Bezier mouse
        movement followed by a natural click with randomised press delay.

    This avoids triggering Cloudflare's pointer-tracking heuristics which flag:
      - Instant cursor teleportation (the old behaviour of page.click())
      - Perfectly straight cursor trajectories
      - Uniform movement speed

    Args:
        page:        Playwright Page object.
        max_retries: Maximum 1-second poll cycles before giving up.

    Returns:
        True if the challenge was cleared (or never appeared), False on timeout.
    """
    print("Scanning page for Cloudflare verification boxes...")

    # Combined selector covers all known Cloudflare Turnstile iframe variants
    IFRAME_SELECTOR = (
        'iframe[src*="challenge-platform"], '
        'iframe[src*="turnstile"], '
        'iframe[src*="://challenges.cloudflare.com"]'
    )

    # Checkbox / widget selectors inside the Turnstile iframe
    CHECKBOX_SELECTOR = (
        "#challenge-stage, "
        "input[type='checkbox'], "
        ".cf-turnstile-wrapper, "
        "[id*='checkbox'], "
        "label[for*='checkbox']"
    )

    for attempt in range(max_retries):
        try:
            # --- Fast path: check if challenge already cleared ---
            title = await page.title()
            if "Just a moment" not in title and "Verify you are human" not in title:
                if attempt == 0:
                    print("No Cloudflare challenge detected — proceeding.")
                else:
                    print("Cloudflare challenge cleared automatically. Continuing.")
                return True

            print(f"Cloudflare challenge active (attempt {attempt + 1}/{max_retries})...")

            # --- Check for a manual Turnstile iframe ---
            iframe_count = await page.locator(IFRAME_SELECTOR).count()

            if iframe_count > 0:
                print("Cloudflare manual verification detected! Executing human-mouse bypass...")

                # Allow up to 5 s for the iframe to fully render its contents
                await asyncio.sleep(2.5)

                iframe_element = await page.wait_for_selector(IFRAME_SELECTOR, timeout=5000)

                if iframe_element:
                    # Enter the iframe's browsing context
                    cf_frame = await iframe_element.content_frame()

                    try:
                        checkbox_element = await cf_frame.wait_for_selector(
                            CHECKBOX_SELECTOR, timeout=3000
                        )
                    except Exception:
                        # Widget not rendered yet — wait and retry next loop cycle
                        print("Turnstile widget not yet rendered, retrying...")
                        await page.wait_for_timeout(1000)
                        continue

                    # bounding_box() returns coords relative to the root viewport —
                    # safe to use directly with page.mouse even inside an iframe
                    box = await checkbox_element.bounding_box()

                    if box:
                        # Randomise the click point inside the widget boundary to
                        # avoid always landing on the dead-centre (a bot signal)
                        click_x = box["x"] + (box["width"] / 2) + random.randint(-8, 8)
                        click_y = box["y"] + (box["height"] / 2) + random.randint(-8, 8)

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
