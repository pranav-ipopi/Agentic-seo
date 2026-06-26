# Cloudflare Stealth & Active Defense Architecture

This document outlines the dual-layer strategy used by our Playwright automation scripts to bypass modern bot-detection systems (specifically Cloudflare Turnstile).

The architecture relies on a **Passive Evasion Layer** to maintain clean browser fingerprints and an **Active Defense Layer** to physically solve challenges when they appear.

---

## 1. Passive Evasion Layer (SeleniumBase CDP)

Instead of running a standard Playwright Chromium instance (which heavily leaks bot signatures like `navigator.webdriver`), our engine uses **SeleniumBase CDP**. 
Playwright connects to this pre-hardened browser via the Chrome DevTools Protocol (CDP), inheriting its stealth properties.

### Fingerprint Hardening (VPS/Docker Safe)
Modern Cloudflare heavily analyzes hardware and network fingerprints. To ensure our headless Linux VPS environments do not leak bot signatures, the `StealthBrowserManager` implements the following rules:

1. **Hardware Acceleration & WebGL Spoofing:** 
   If the script detects it is running on Linux/VPS (`RUNNING_ON_VPS=true`), it injects `--use-gl=angle` and `--use-angle=gl`. This spoofs the WebGL renderer to avoid defaulting to `SwiftShader` (a pure software renderer instantly flagged by Cloudflare as a headless bot).
2. **Dimension Consistency:** 
   The browser is forced to start maximized (`--start-maximized`) and is locked to `1920x1080`. This ensures that `window.outerWidth` and `window.innerWidth` match the viewport perfectly, neutralizing Cloudflare's dimension discrepancy checks.
3. **Smart Resource Blocking:** 
   Media and known trackers (Google Analytics, Hotjar) are blocked to speed up execution. Crucially, requests to `/cdn-cgi/` are explicitly **allowed**, as blocking them breaks Cloudflare's verification loop.

---

## 2. Active Defense Layer (Human-Mouse Emulation)

While passive evasion clears the majority of Cloudflare interstitial screens instantly, high-security domains will present an active Turnstile checkbox. Playwright's native `locator.click()` teleports the cursor and is instantly flagged as a bot.

To solve this, we use **Human-Mouse Emulation**:

1. **Turnstile Detection:** The script scans all `page.frames` for URLs containing `challenge-platform` or `turnstile`.
2. **Bezier Pathing:** If a challenge is found, the script generates a quadratic Bezier curve from a random coordinate to the checkbox's bounding box.
3. **Easing & Micro-Jitters:** Using `pytweening`, the cursor accelerates and decelerates naturally. It injects 4–12ms micro-delays between pixel movements to simulate human muscle tremor.
4. **Variable Hold:** The final click is executed with a randomized hold duration (50-150ms).

*This logic is centralized in `methods/stealth_browser.py -> handle_cloudflare_challenge()`*.

---

## 3. The Defensive Navigation Loop (`safe_goto`)

A major issue with Cloudflare intercepts is that they can cause `page.goto(url, wait_until="domcontentloaded")` to hang indefinitely, resulting in a 30-second timeout. 

To prevent this, all templates must route their navigation through the `safe_goto` wrapper (or `navigate_and_verify` in standalone templates).

### How it Works:
1. **Commit Phase Navigation:** `safe_goto` uses `wait_until="commit"`. This returns control to our script the millisecond the server headers return, allowing us to inspect the page *before* waiting for heavy DOM rendering.
2. **Immediate Challenge Verification:** The script immediately calls `handle_cloudflare_challenge(page)`. If a challenge is active, it physically solves it using the Bezier logic.
3. **Fail-Fast:** If the challenge cannot be solved within 15 seconds, `safe_goto` returns `False` or throws a `SiteDownError`.
4. **Call-Site Protection:** Worker scripts evaluate the return value. If navigation failed, the worker **aborts the job early**. It *never* proceeds to blind `locator.fill()` executions on a blocked page.

---

## 4. Failure Handling Strategy

When a worker script fails, the error type dictates the fallback behavior to preserve proxy health and database integrity:

| Failure Type | Identified By | Mitigation Strategy |
|---|---|---|
| **Site Down / Hard Block** | `SiteDownError` (from `safe_goto`) | The site is blocked by unbeatable Cloudflare or offline. Flag the site URL in the database to be skipped for 2-4 hours. **Do not retry immediately.** |
| **Proxy Authentication Drop** | `RuntimeError` (`ERR_INVALID_AUTH_CREDENTIALS`) | The proxy IP died or credentials rotated mid-session. Immediately flag the executor to request an early proxy rotation. |
| **Element Miss / Layout Change** | `SubmissionFailedError` / `ElementTimeoutError` | Navigation passed security, but the required registration fields are missing. Save a screenshot to `failures/`. Do not rotate proxy, as the issue is a UI change, not a block. |
