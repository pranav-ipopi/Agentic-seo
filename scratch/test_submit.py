import asyncio
import sys
import os
import random
import string
import urllib.parse as urlparse
from twocaptcha import TwoCaptcha

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../playwright_automation/backlink_automation")))

from methods.stealth_browser import StealthBrowserManager
from methods.cloudflare import bypass_cloudflare

def generate_random_credentials():
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    name = f"UserEra{suffix}"
    email = f"era_{suffix}@mailinator.com"
    password = "P@ssword1234!"
    return {
        "name": name,
        "email": email,
        "password": password
    }

async def solve_recaptcha_2captcha(page_url, sitekey):
    print(f"Solving Google reCAPTCHA v2 with 2captcha using sitekey: {sitekey}...")
    try:
        api_key = '20205071fed24f4c1418d43380555585'
        solver = TwoCaptcha(api_key)
        
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, 
            lambda: solver.recaptcha(sitekey=sitekey, url=page_url)
        )
        token = result.get('code')
        if token:
            print("Successfully solved reCAPTCHA!")
            return token
        else:
            print("Failed to solve reCAPTCHA: Empty code.")
            return None
    except Exception as e:
        print(f"Error calling 2captcha: {e}")
        return None

async def main():
    manager = StealthBrowserManager()
    await manager.start()
    
    page = None
    try:
        page = await manager.get_page()
        
        creds = generate_random_credentials()
        print("=" * 60)
        print("GENERATED CREDENTIALS FOR REGISTRATION:")
        print(f"Name:     {creds['name']}")
        print(f"Email:    {creds['email']}")
        print(f"Password: {creds['password']}")
        print("=" * 60)
        
        print("Navigating to registration page...")
        await page.goto("https://bookmarkingera.com/register", wait_until="domcontentloaded")
        await bypass_cloudflare(page)
        await page.wait_for_timeout(1000)
        
        # Fill registration form
        print("Filling registration form...")
        await page.locator("input#name").fill(creds["name"])
        await page.locator("input#email").fill(creds["email"])
        await page.locator("input#password").fill(creds["password"])
        await page.locator("input#password_confirmation").fill(creds["password"])
        
        print("Submitting registration...")
        await page.locator("button[type='submit']").click()
        
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)
        print(f"URL after registration: {page.url}")
        
        # Go to URL submission page
        print("Navigating to submission page...")
        await page.goto("https://bookmarkingera.com/add/bookmark/url", wait_until="domcontentloaded")
        await page.wait_for_timeout(1000)
        
        # Generate random client URL
        client_site = f"https://www.{random.choice(['tech', 'seo', 'blog', 'news', 'info'])}-site-{random.randint(10000, 99999)}.org"
        print(f"Filling URL: {client_site}")
        await page.locator("input#title").fill(client_site)
        
        # Find sitekey
        print("Finding sitekey...")
        sitekey = None
        grecaptcha_element = page.locator("[data-sitekey]").first
        if await grecaptcha_element.count() > 0:
            sitekey = await grecaptcha_element.get_attribute("data-sitekey")
        
        if not sitekey:
            iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
            if await iframe.count() > 0:
                src = await iframe.get_attribute("src")
                parsed = urlparse.urlparse(src)
                sitekey = urlparse.parse_qs(parsed.query).get('k', [None])[0]
                
        print(f"Sitekey found: {sitekey}")
        if not sitekey:
            raise Exception("No sitekey found!")
            
        token = await solve_recaptcha_2captcha(page.url, sitekey)
        if not token:
            raise Exception("Failed to solve recaptcha")
            
        print("Injecting recaptcha token...")
        await page.evaluate(f"""(token) => {{
            const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
            fields.forEach(el => {{
                el.value = token;
                el.innerHTML = token;
            }});
        }}""", token)
        
        await page.wait_for_timeout(1000)
        
        print("Submitting Step 1...")
        await page.locator("input#submit").click()
        
        # Wait for Step 2 page or manual entry link to load (up to 60 seconds)
        try:
            print("Waiting for Step 2 category selector or manual entry link to appear (up to 60 seconds)...")
            await page.wait_for_selector("select[name='category'], a[href*='/manual']", timeout=60000)
            
            # Check if the 'Add Mannually' link is visible
            manual_link = page.locator("a[href*='/manual']")
            if await manual_link.count() > 0 and await manual_link.is_visible():
                print("Server curl timed out. Clicking 'Add Mannually' button...")
                await manual_link.click()
                # Wait for Category select to load on the manual page
                await page.wait_for_selector("select[name='category']", timeout=20000)
                
            print("Successfully reached Step 2!")
        except Exception as e:
            print(f"Failed to reach Step 2. Error: {e}. Saving error state...")
            await asyncio.sleep(2)
            html_content = await page.content()
            with open("c:/Users/IPOPI/Desktop/Agentic-seo/scratch/error_page.html", "w", encoding="utf-8") as f:
                f.write(html_content)
            await page.screenshot(path="c:/Users/IPOPI/Desktop/Agentic-seo/scratch/error_screenshot.png")
            print("Error HTML saved to scratch/error_page.html")
            print("Error Screenshot saved to scratch/error_screenshot.png")
            raise e
            
        print(f"URL after Step 1 submit: {page.url}")
        
        # Fill Step 2 fields
        print("Filling Step 2 fields...")
        
        # URL Field - Check if it needs to be filled (e.g. on manual page)
        url_field = page.locator("input#url")
        if await url_field.count() > 0:
            val = await url_field.get_attribute("value") or ""
            is_readonly = await url_field.get_attribute("readonly") is not None
            if not val or not is_readonly:
                print(f"URL field is editable or empty. Filling URL: {client_site}")
                await url_field.fill(client_site)
        
        # Category
        category_select = page.locator("select[name='category']")
        await category_select.select_option("2") # SEO
        
        # Title (between 10 and 200 chars)
        keyword = f"Top SEO Backlink Tools {creds['name']}"
        title = keyword
        if len(title) < 10:
            title = f"{title} For Beginners"
        print(f"Filling Title: {title}")
        await page.locator("input#title").fill(title)
        
        # Description (must be 200 - 700 chars, no URLs)
        description = (
            "This is a detailed analysis of high performance search engine optimization tools. "
            "Developing quality backlinks is one of the most effective strategies to improve domain authority "
            "and increase organic search visibility. With modern automation techniques, webmasters can submit "
            "bookmarks and list resources more efficiently. These practices help indexing speed and ensure "
            "that search engines can locate high quality content across the web. Regular optimization and proper "
            "anchor text usage are key components of achieving top rankings on popular search engines today."
        )
        print(f"Description length: {len(description)}")
        await page.locator("textarea#articleBody").fill(description)
        
        # Keywords (must be 30 - 300 chars, comma-separated, no URLs)
        keywords = "seo tools, search optimization, backlinks, link building, domain authority, web promotion"
        print(f"Keywords length: {len(keywords)}")
        await page.locator("input#keywords").fill(keywords)
        
        await page.wait_for_timeout(1000)
        
        print("Submitting Step 2...")
        # Submit button on Step 2
        await page.locator("input#submit").click()
        
        await page.wait_for_timeout(5000)
        await page.wait_for_load_state("networkidle")
        
        print(f"Final Page URL: {page.url}")
        
        # Save HTML and Screenshot of Step 2 response
        html_content = await page.content()
        with open("c:/Users/IPOPI/Desktop/Agentic-seo/scratch/success_page.html", "w", encoding="utf-8") as f:
            f.write(html_content)
        await page.screenshot(path="c:/Users/IPOPI/Desktop/Agentic-seo/scratch/success_screenshot.png")
        print("Success HTML saved to scratch/success_page.html")
        print("Success Screenshot saved to scratch/success_screenshot.png")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if page:
            await page.close()
        await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
