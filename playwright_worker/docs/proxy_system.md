# Proxy Management System

The Backlink Automation worker utilizes an advanced, dynamic Proxy Management system designed to cycle through multiple proxies, handle failovers, and maintain complete stealth while bypassing security challenges like Cloudflare.

## Architecture Overview

The system is built around the `ProxyManager` service (`services/proxy_manager.py`) which acts as the orchestrator for proxy selection, validation, and injection.

### Key Components:
1. **Proxy Lists (`configs/`)**: Text files where you store your raw proxy strings.
2. **Proxy Manager (`ProxyManager`)**: Service that reads the lists, shuffles them, tests their health against `httpbin.org/ip`, and handles failover logic.
3. **Stealth Browser Manager (`StealthBrowserManager`)**: Accepts the healthy proxy injected by the ProxyManager dynamically into the Playwright browser context via SeleniumBase CDP connection.

## How It Works

1. When the `vps_worker_playwright` boots up a new browser session (e.g., when it detects pending tasks), it invokes the `ProxyManager`.
2. The `ProxyManager` aggregates all proxies from the `configs/primary_proxies.txt` file and shuffles them randomly to ensure load balancing.
3. It tests the first proxy in the list by injecting it into the stealth browser and navigating to `http://httpbin.org/ip`.
4. If the proxy successfully returns an IP address and bypasses blocks, it is locked in for that entire worker session.
5. If the proxy is dead or banned, the `ProxyManager` catches the exception and immediately tries the next proxy in the list.
6. **Fallback Mechanism:** If *all* primary proxies fail, it falls back to the `configs/fallback_proxies.txt` list. If those also fail, it gracefully falls back to a direct connection (no proxy).

---

## Adding and Formatting Proxies

You do not need to modify any Python code or `.env` variables to add or remove proxies. 

You can use **any provider** (2Captcha, IPRoyal, BrightData, DataImpulse, etc.) because the system features a robust parser that automatically detects the protocol (HTTP, SOCKS4, SOCKS5) and correctly formats the username/password authentication for Playwright.

### Configuration Files
- `configs/primary_proxies.txt`: Place your main rotating proxies here (e.g., 2Captcha).
- `configs/fallback_proxies.txt`: Place your backup proxies here (e.g., IPRoyal) in case the primary network goes down.

### Supported Formats
Paste your proxies into the text files **one per line**. The system supports any of the following standard proxy formats:
- `http://user:password@host:port`
- `http://host:port:user:password`
- `socks5://user:password@host:port`
- `socks5://host:port:user:password`

---

## Understanding 2Captcha Rotating Proxies

If you are using 2Captcha rotating proxies, your proxy string will look something like this:
`http://u7744f283557105b7-zone-custom-session-Qj5MrqRkY-sessTime-15:password@ap.proxy.2captcha.com:2334`

Here is exactly what that string means and how it guarantees stealth:

1. **`session-Qj5MrqRkY` (Unique Session ID):**
   This is the most critical part of the string. 2Captcha assigns a completely different exit IP address to every unique session ID. If you provide 50 lines of proxies, each with a different session ID, you are simultaneously running 50 completely different, unique IP addresses.
2. **`sessTime-15` (Sticky Rotation):**
   This parameter tells 2Captcha's servers to hold the assigned IP address "sticky" for exactly 15 minutes. Once 15 minutes have passed, the session will automatically rotate and be assigned a brand new IP address in the background.

By combining the random shuffling of the `ProxyManager` with the automatic 15-minute sticky rotation of 2Captcha, the automation ensures that the target sites never see the same IP address enough times to trigger a ban.

---

## Health Check Logs

You can monitor the health and behavior of the proxy system directly in your PM2 logs (`pm2 logs backlink-worker`). 

When a session boots up successfully, you will see a log confirming the exact active IP address that Playwright is routing through:
```
1|backlink-worker  | [ProxyManager] Proxy health-check passed. Active IP: {
1|backlink-worker  |   "origin": "88.97.178.155"
1|backlink-worker  | }
```
This guarantees that your VPS server's real IP is completely hidden and the automation is safely passing through the proxy node.
