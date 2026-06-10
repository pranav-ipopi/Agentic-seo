import asyncio
from camoufox.async_api import AsyncCamoufox

INTERCEPT_SCRIPT = """
    window.__cfTurnstileParams = null;
    window.__cfCallback = null;
    
    let originalTurnstile = window.turnstile;
    Object.defineProperty(window, 'turnstile', {
        get: function() {
            return originalTurnstile;
        },
        set: function(val) {
            if (val && val.render) {
                const originalRender = val.render;
                val.render = function(a, b) {
                    console.log("TURNSTILE RENDER INTERCEPTED SYNCHRONOUSLY!", b);
                    window.__cfTurnstileParams = {
                        sitekey: b.sitekey,
                        pageurl: window.location.href,
                        data: b.cData,
                        pagedata: b.chlPageData,
                        action: b.action,
                        userAgent: navigator.userAgent,
                    };
                    window.__cfCallback = b.callback;
                    return originalRender.apply(this, arguments);
                };
            }
            originalTurnstile = val;
        },
        configurable: true
    });
"""

async def main():
    async with AsyncCamoufox(headless=False) as browser:
        # Create context
        context = await browser.new_context()
        await context.add_init_script(INTERCEPT_SCRIPT)
        
        page = await context.new_page()
        
        # Forward console logs
        page.on("console", lambda msg: print(f"Browser console: {msg.text}"))
        
        print("Navigating to livebookmarking.com/submit...")
        await page.goto("https://livebookmarking.com/submit", wait_until="domcontentloaded")
        
        print("Waiting for Turnstile params...")
        for _ in range(15):
            params = await page.evaluate("window.__cfTurnstileParams")
            if params:
                print(f"Intercepted params: {params}")
                break
            await asyncio.sleep(1)
        else:
            print("Failed to intercept params.")
            html = await page.content()
            with open("failed_intercept.html", "w", encoding="utf-8") as f:
                f.write(html)
            print("Saved failed_intercept.html")

if __name__ == "__main__":
    asyncio.run(main())
