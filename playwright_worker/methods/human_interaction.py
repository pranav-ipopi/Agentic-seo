"""
human_interaction.py

Provides human-like mouse movement and typing for Playwright automation.

Mouse movement — STRUCTURAL variation (not just random values):
  - 20% chance: nearly straight path (familiar / large target)
  - 30% chance: no overshoot (easy target, slow approach)
  - 10% chance: double overshoot (imprecise flick)
  - 40% chance: standard overshoot + single correction (default)
  - All paths: cubic Bézier, Gaussian micro-stalls, Fitts's Law deceleration,
    post-click micro-drift, Gaussian hold time, continuous cursor tracking.

Typing — random structure per session:
  - Randomized base WPM per action
  - Per-character jitter multiplier (0.5x–1.8x)
  - ~2% typo + Backspace correction (non-sensitive fields only)
  - ~3% thought-pause mid-word
"""

import asyncio
import math
import random

try:
    import pytweening
    _PYTWEENING_AVAILABLE = True
except ImportError:
    _PYTWEENING_AVAILABLE = False


# ---------------------------------------------------------------------------
# Bézier helpers
# ---------------------------------------------------------------------------

def _cubic_bezier_point(t, p0, p1, p2, p3):
    u = 1 - t
    x = u**3*p0[0] + 3*u**2*t*p1[0] + 3*u*t**2*p2[0] + t**3*p3[0]
    y = u**3*p0[1] + 3*u**2*t*p1[1] + 3*u*t**2*p2[1] + t**3*p3[1]
    return (int(x), int(y))


def _make_cubic_path(start, end, points, control_spread=50, nearly_straight=False):
    """
    Build a cubic Bézier path.
    nearly_straight: dramatically reduces control point offsets.
    """
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    spread = 8 if nearly_straight else control_spread
    cp1 = (
        sx + dx * random.uniform(0.15, 0.45) + random.randint(-spread, spread),
        sy + dy * random.uniform(0.10, 0.40) + random.randint(-spread, spread),
    )
    cp2 = (
        sx + dx * random.uniform(0.55, 0.85) + random.randint(-spread, spread),
        sy + dy * random.uniform(0.55, 0.85) + random.randint(-spread, spread),
    )
    path = []
    for i in range(points):
        t = i / float(points - 1)
        t_e = pytweening.easeInOutQuad(t) if _PYTWEENING_AVAILABLE else t
        path.append(_cubic_bezier_point(t_e, start, cp1, cp2, end))
    return path


def _path_exit_direction(path):
    """Return unit vector of the last movement segment."""
    if len(path) < 2:
        return (1.0, 0.0)
    x1, y1 = path[-2]
    x2, y2 = path[-1]
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy) or 1.0
    return (dx / length, dy / length)


# ---------------------------------------------------------------------------
# Continuous cursor state
# ---------------------------------------------------------------------------

# Tracks where the virtual cursor currently is so every move starts from
# a realistic position — no teleporting back to (0, 0) between actions.
_last_mouse_pos: tuple = (random.randint(300, 700), random.randint(200, 500))


async def _travel(page, start, end, nearly_straight=False, slow_near_end=True):
    """
    Animate the mouse from start → end along a cubic Bézier.
    Point count scales with distance — short moves are much faster.
    """
    dist = math.hypot(end[0] - start[0], end[1] - start[1])
    # Short moves (< 150px): 6-12 points. Long moves (> 400px): up to 35.
    point_count = max(6, min(35, int(dist / 14)))
    path = _make_cubic_path(start, end, point_count, nearly_straight=nearly_straight)
    decel_start = int(point_count * 0.80) if slow_near_end else point_count + 1

    for i, (x, y) in enumerate(path):
        await page.mouse.move(x, y)
        if i >= decel_start:
            delay = max(0.002, random.gauss(0.015, 0.005))
        else:
            delay = max(0.002, random.gauss(0.007, 0.002))
        if random.random() < 0.04:          # micro-stall
            delay += max(0.0, random.gauss(0.018, 0.006))
        await asyncio.sleep(delay)

    return path


async def _do_overshoot(page, target_x, target_y, approach_path):
    """Overshoot past target → pause → correct back. Returns final path."""
    norm_x, norm_y = _path_exit_direction(approach_path)
    dist = random.uniform(5, 20)
    over_x = target_x + norm_x * dist + random.uniform(-4, 4)
    over_y = target_y + norm_y * dist + random.uniform(-4, 4)

    over_path = await _travel(page, (target_x, target_y), (over_x, over_y),
                              nearly_straight=True, slow_near_end=False)
    await asyncio.sleep(max(0.05, random.gauss(0.130, 0.040)))   # "noticing" pause

    correct_path = await _travel(page, (over_x, over_y), (target_x, target_y),
                                 nearly_straight=True, slow_near_end=True)
    return correct_path


# ---------------------------------------------------------------------------
# Public: move_mouse_humanlike
# ---------------------------------------------------------------------------

async def move_mouse_humanlike(page, target_x: float, target_y: float) -> None:
    """
    Move the virtual mouse to (target_x, target_y) with one of four randomly
    chosen structural movement profiles. Profile is biased by distance:
    short moves (nearby fields) almost never overshoot.
    """
    global _last_mouse_pos
    start = _last_mouse_pos
    end = (target_x, target_y)
    dist = math.hypot(end[0] - start[0], end[1] - start[1])

    # Short-distance bias: nearby fields (< 200px) strongly prefer direct profiles
    if dist < 200:
        roll = random.random()
        # 50% straight, 40% curved-direct, 10% single overshoot — skip double
        if roll < 0.50:
            await _travel(page, start, end, nearly_straight=True)
        elif roll < 0.90:
            await _travel(page, start, end, nearly_straight=False)
        else:
            path = await _travel(page, start, end, nearly_straight=False)
            await _do_overshoot(page, target_x, target_y, path)
    else:
        roll = random.random()
        # Full profile mix for long-distance moves
        if roll < 0.20:
            await _travel(page, start, end, nearly_straight=True)
        elif roll < 0.50:
            await _travel(page, start, end, nearly_straight=False)
        elif roll < 0.90:
            path = await _travel(page, start, end, nearly_straight=False)
            path = await _do_overshoot(page, target_x, target_y, path)
            if random.random() < 0.40:
                micro_x = target_x + random.uniform(-3, 3)
                micro_y = target_y + random.uniform(-3, 3)
                await page.mouse.move(micro_x, micro_y)
                await asyncio.sleep(max(0.002, random.gauss(0.006, 0.002)))
                await page.mouse.move(target_x, target_y)
        else:
            path = await _travel(page, start, end, nearly_straight=False)
            path = await _do_overshoot(page, target_x, target_y, path)
            path = await _do_overshoot(page, target_x, target_y, path)

    _last_mouse_pos = end
    # Pre-click hover: hand steadies
    await asyncio.sleep(max(0.02, random.gauss(0.060, 0.020)))


# ---------------------------------------------------------------------------
# Public: human_click
# ---------------------------------------------------------------------------

async def human_click(page, locator) -> None:
    """
    Scroll element into view, move the virtual mouse with structural variation,
    then click with Gaussian hold time and post-click micro-drift.

    Occasionally (15% chance) hovers briefly over a random nearby coordinate
    before moving to the actual target — mirrors how humans scan the page.
    """
    await locator.scroll_into_view_if_needed()
    await asyncio.sleep(random.uniform(0.05, 0.15))

    box = await locator.bounding_box()
    if not box:
        await locator.click(delay=int(max(40, random.gauss(90, 25))))
        return

    click_x = box["x"] + box["width"]  * random.uniform(0.25, 0.75)
    click_y = box["y"] + box["height"] * random.uniform(0.25, 0.75)

    # 15%: hover near (but not on) the target first — simulates page scanning
    if random.random() < 0.15:
        nearby_x = click_x + random.uniform(-80, 80)
        nearby_y = click_y + random.uniform(-40, 40)
        await move_mouse_humanlike(page, nearby_x, nearby_y)
        await asyncio.sleep(random.gauss(0.100, 0.030))

    await move_mouse_humanlike(page, click_x, click_y)

    # Press down
    await page.mouse.down()

    # Post-press micro-drift (hand trembles while holding button)
    await page.mouse.move(
        click_x + random.uniform(-2, 2),
        click_y + random.uniform(-2, 2)
    )

    # Gaussian hold time centred on ~90 ms
    hold_ms = max(38, random.gauss(90, 25))
    await asyncio.sleep(hold_ms / 1000)

    await page.mouse.up()
    await asyncio.sleep(random.uniform(0.04, 0.14))


# ---------------------------------------------------------------------------
# Public: human_type
# ---------------------------------------------------------------------------

async def human_type(page, locator, text: str, is_sensitive: bool = False) -> None:
    """
    Type text with:
      - Random base WPM per call (slow session vs fast session)
      - Per-character jitter (0.5x–1.8x)
      - ~2% typo + Backspace (non-sensitive fields only)
      - ~3% thought-pause mid-word
    """
    await human_click(page, locator)
    await locator.fill("")
    await asyncio.sleep(random.uniform(0.05, 0.18))

    base_delay = random.uniform(0.022, 0.060)   # ~150–250 WPM range

    for char in text:
        current_delay = base_delay * random.uniform(0.5, 1.8)

        # Typo + correction (non-sensitive only)
        if not is_sensitive and char.isalpha() and random.random() < 0.02:
            wrong = random.choice("abcdefghijklmnopqrstuvwxyz")
            await page.keyboard.press(wrong)
            await asyncio.sleep(max(0.03, current_delay))
            await asyncio.sleep(max(0.04, random.gauss(0.110, 0.030)))  # notice pause
            await page.keyboard.press("Backspace")
            await asyncio.sleep(max(0.02, random.gauss(0.060, 0.020)))

        await page.keyboard.press(char)
        await asyncio.sleep(max(0.018, current_delay))

        # Thought-pause mid-word (~3% per character)
        if random.random() < 0.03:
            await asyncio.sleep(max(0.05, random.gauss(0.130, 0.040)))

    await asyncio.sleep(random.uniform(0.08, 0.22))
