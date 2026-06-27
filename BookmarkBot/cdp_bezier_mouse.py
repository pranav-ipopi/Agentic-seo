import math
import random
import time

def calculate_human_path(start: tuple[float, float], end: tuple[float, float], points_count: int = 35) -> list[tuple[int, int]]:
    """Generates a smooth, human-like curved mouse path between two coordinates."""
    start_x, start_y = start
    end_x, end_y = end

    # Random control point offset creates the natural arc / curve
    control_x = start_x + (end_x - start_x) * random.uniform(0.2, 0.8) + random.randint(-40, 40)
    control_y = start_y + (end_y - start_y) * random.uniform(0.2, 0.8) + random.randint(-40, 40)

    path = []
    for i in range(points_count):
        t = i / float(points_count - 1)
        # Simple linear ease in/out fallback (without pytweening)
        t_eased = t * t * (3 - 2 * t) # smoothstep
        
        # Quadratic Bezier formula
        x = (1 - t_eased) ** 2 * start_x + 2 * (1 - t_eased) * t_eased * control_x + t_eased ** 2 * end_x
        y = (1 - t_eased) ** 2 * start_y + 2 * (1 - t_eased) * t_eased * control_y + t_eased ** 2 * end_y
        path.append((int(x), int(y)))

    return path

def move_mouse_humanlike_cdp(driver, target_x: float, target_y: float) -> None:
    """
    Moves the mouse via CDP from a random starting position to the target
    coordinates along a curved Bezier path matching Fitts's Law.
    """
    current_x = random.randint(0, 120)
    current_y = random.randint(0, 120)

    # Calculate distance for Fitts's Law timing
    distance = math.sqrt((target_x - current_x)**2 + (target_y - current_y)**2)
    base_duration = max(0.2, 0.15 + (distance / 2000))
    duration = base_duration * random.uniform(0.8, 1.4)
    
    # Add cognitive start delay
    time.sleep(random.uniform(0.1, 0.3))

    path = calculate_human_path((current_x, current_y), (target_x, target_y))
    step_delay = duration / len(path)

    for x, y in path:
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
            "type": "mouseMoved",
            "x": x,
            "y": y
        })
        time.sleep(max(0.001, step_delay * random.uniform(0.8, 1.2)))

    # Human tremor at destination (1-3px wiggle)
    for _ in range(random.randint(1, 3)):
        wiggle_x = target_x + random.randint(-2, 2)
        wiggle_y = target_y + random.randint(-2, 2)
        driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
            "type": "mouseMoved",
            "x": wiggle_x,
            "y": wiggle_y
        })
        time.sleep(random.uniform(0.02, 0.08))

    # Brief hover pause before pressing down
    time.sleep(random.uniform(0.2, 0.6))

def click_cdp(driver, x: float, y: float):
    """Executes a full CDP click at the given coordinates."""
    driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
        "type": "mousePressed",
        "x": x,
        "y": y,
        "button": "left",
        "clickCount": 1
    })
    time.sleep(random.uniform(0.05, 0.15))
    driver.execute_cdp_cmd("Input.dispatchMouseEvent", {
        "type": "mouseReleased",
        "x": x,
        "y": y,
        "button": "left",
        "clickCount": 1
    })
