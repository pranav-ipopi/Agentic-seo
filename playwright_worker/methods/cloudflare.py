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
    If it doesn't pass, attempt human-like interaction to bypass the Turnstile.
    Returns True if successfully bypassed, False if it times out.
    """
    return await cloudflare_updated(page, max_retries)


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
    from methods.stealth_browser import handle_cloudflare_challenge
    return await handle_cloudflare_challenge(page, max_retries)
