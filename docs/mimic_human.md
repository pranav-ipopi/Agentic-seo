Neither is "close to human" out of the box, but **SeleniumBase with UC Mode** gets dramatically closer because it specifically patches the automation fingerprints that Playwright leaves exposed.

Here's the head-to-head comparison:

---

## Detection Surface: What Cloudflare Actually Checks

| Fingerprint | Real Human Chrome | Playwright | Selenium (vanilla) | SeleniumBase UC Mode |
|-------------|-------------------|------------|-------------------|----------------------|
| `navigator.webdriver` | `undefined` | `true` | `true` | `undefined` ✅ |
| `cdc_` injected variables | None | N/A | Present | Removed ✅ |
| `--enable-automation` flag | Absent | Present | Present | Removed ✅ |
| Chrome launch args | Normal user set | 15+ automation flags | 10+ automation flags | Minimal, user-like ✅ |
| `window.chrome` object | Full, native | Stripped/modified | Modified | Restored ✅ |
| WebGL vendor/renderer | Real GPU (Intel/NVIDIA/AMD) | `Google Inc.` or null | `Google Inc.` or null | Real GPU ✅ |
| `navigator.plugins` | 3+ (PDF, etc.) | 0 or 1 | 0 or 1 | 2+ ✅ |
| `navigator.languages` | `["en-US", "en"]` | Often `["en-US"]` | Often `["en-US"]` | Full array ✅ |
| Event `isTrusted` on clicks | `true` | `false` (synthetic) | `false` (synthetic) | `true` via CDP ✅ |
| TLS/JA3 fingerprint | Real Chrome BoringSSL | Node.js/Playwright TLS | ChromeDriver TLS | Real Chrome BoringSSL ✅ |
| Headless vs headed | Real display | Headless default | Headless default | Headed by default ✅ |
| Mouse movement curves | Human (Bezier, jitter) | Instant teleport | Instant teleport | Simulated curves ✅ |

---

## The Critical Difference

**Playwright** is built for **speed and reliability**—not stealth. Its architecture assumes you control the environment (internal testing, non-bot-protected sites). It launches Chrome with automation flags because it *needs* them to function.

**SeleniumBase UC Mode** is built for **evasion**. It:
1. Launches a separate, clean Chrome process first
2. Disconnects ChromeDriver before page load (so `navigator.webdriver` never gets set)
3. Reconnects via CDP only after the page is stable
4. Patches `cdc_` variables and automation flags from the JavaScript scope
5. Uses real mouse/keyboard events via CDP instead of synthetic JavaScript

---

## Visual Analogy

| Tool | Analogy |
|------|---------|
| **Real Chrome** | A human walking through a door normally |
| **Playwright** | A robot wearing a "I AM A ROBOT" t-shirt trying to walk through |
| **Selenium (vanilla)** | A robot with visible wires and beeping sounds |
| **SeleniumBase UC Mode** | A robot wearing a very convincing human mask, moving like a human, using the same door |

---

## Why Playwright Struggles to Catch Up

Playwright's core design decisions make it inherently detectable:

- **Browser patching at compile time**: Playwright bundles modified Chromium/Firefox/WebKit binaries. These have different signatures than real Chrome.
- **Node.js runtime**: Playwright runs inside Node.js, which has its own TLS fingerprint (different from Chrome's BoringSSL).
- **No UC Mode equivalent**: There's no official "undetected" Playwright mode. Community patches (`playwright-stealth`) lag behind and break frequently.
- **CDP is secondary**: Playwright uses its own protocol primarily; CDP is a layer on top. This creates timing inconsistencies that detection scripts notice.

---

## When Playwright Is Actually Better

Despite being less stealthy, Playwright wins when:

| Scenario | Why Playwright |
|----------|---------------|
| Internal tools (no bot protection) | Faster, cleaner API, better debugging |
| API + browser hybrid workflows | Native request interception, network mocking |
| Cross-browser testing (Firefox, Safari) | First-class WebKit/Gecko support |
| Non-CF sites where speed matters | 2-3x faster execution |

---

## The Verdict

| Question | Answer |
|----------|--------|
| Which is closest to real human out of the box? | **SeleniumBase UC Mode** by a large margin |
| Can Playwright be made stealthy? | Only with significant third-party patches; rarely sustainable |
| Should I use Playwright for Cloudflare bypass? | **No**—unless you're connecting it to SeleniumBase's CDP endpoint (Method 7 from the guide) |
| For 5,000/day CF bypass on your Windows PC? | **SeleniumBase UC Mode** is the only practical choice |

**Bottom line:** Playwright is a precision tool for controlled environments. SeleniumBase UC Mode is a disguise kit for hostile environments. For bypassing Cloudflare, you need the disguise.