import asyncio
import sys
import os
import random
import string
from typing import Optional
from playwright.async_api import Page
from twocaptcha import TwoCaptcha

BASE_URL = "https://www.bookmarks2u.com"

# Add backlink_automation directory to python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from methods.stealth_browser import StealthBrowserManager
from methods.cloudflare import bypass_cloudflare

def generate_random_credentials():
    first_names = [
        "john", "mary", "james", "patricia", "robert", "jennifer", "michael", "elizabeth",
        "william", "linda", "david", "barbara", "richard", "susan", "joseph", "jessica",
        "thomas", "sarah", "charles", "karen", "christopher", "nancy", "daniel", "lisa",
        "matthew", "betty", "anthony", "margaret", "mark", "sandra", "donald", "ashley",
        "steven", "kimberly", "paul", "emily", "andrew", "donna", "joshua", "michelle",
        "kenneth", "carol", "kevin", "amanda", "brian", "dorothy", "george", "melissa",
        "timothy", "deborah", "ronald", "stephanie", "edward", "rebecca", "jason", "sharon",
        "jeffrey", "laura", "ryan", "cynthia", "jacob", "kathleen", "gary", "amy",
        "nicholas", "shirley", "eric", "angela", "jonathan", "helen", "stephen", "anna"
    ]
    last_names = [
        "smith", "johnson", "williams", "brown", "jones", "garcia", "miller", "davis",
        "rodriguez", "martinez", "hernandez", "lopez", "gonzalez", "wilson", "anderson",
        "thomas", "taylor", "moore", "jackson", "martin", "lee", "perez", "thompson",
        "white", "harris", "sanchez", "clark", "ramirez", "lewis", "robinson", "walker",
        "young", "allen", "king", "wright", "scott", "torres", "nguyen", "hill",
        "flores", "green", "adams", "nelson", "baker", "hall", "rivera", "campbell"
    ]
    domains = [
        "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
        "mail.com", "aol.com", "zoho.com", "gmx.com", "yandex.com", "mailinator.com"
    ]
    
    first = random.choice(first_names)
    last = random.choice(last_names)
    sep = random.choice(["", "_", "."])
    num = random.randint(10, 9999)
    
    username = f"{first}{sep}{last}{num}"
    domain = random.choice(domains)
    email = f"{username}@{domain}"
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=10))
    
    return {
        "username": username,
        "email": email,
        "password": password
    }

async def solve_recaptcha_2captcha(page_url, sitekey):
    print("Solving Google reCAPTCHA v2 with 2captcha...")
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

async def _extract_backlink_url(page: Page) -> Optional[str]:
    """
    Try multiple strategies to find the newly created story URL.
    """
    # Strategy 1: Current page URL
    current_url = page.url
    if ("/story" in current_url or "/articles/" in current_url) and "login" not in current_url:
        return current_url

    # Strategy 2: Look for WordPress post container with post ID in preview listing
    try:
        post_container = page.locator(".preview-listing div.blog-box[id^='post-'], div.blog-box[id^='post-']").first
        if await post_container.count() > 0:
            post_id_attr = await post_container.get_attribute("id")
            if post_id_attr and post_id_attr.startswith("post-"):
                post_id = post_id_attr.replace("post-", "")
                if post_id.isdigit():
                    return f"{BASE_URL}/?p={post_id}"
    except Exception:
        pass

    # Strategy 3: Look for links containing /story or /articles/ in the page
    try:
        story_links = await page.locator("a[href*='/story'], a[href*='/articles/']").all()
        for link in story_links:
            href = await link.get_attribute("href")
            if href and ("/story" in href or "/articles/" in href) and len(href) > 20:
                if not href.startswith("http"):
                    href = BASE_URL + href if href.startswith("/") else BASE_URL + "/" + href
                # Avoid comment/discuss links
                if "#discuss" not in href and "#comments" not in href:
                    return href
    except Exception:
        pass

    # Strategy 4: Look for success text and nearby link
    try:
        success_texts = ["submitted", "success", "published", "your story"]
        for text in success_texts:
            locator = page.get_by_text(text, exact=False)
            if await locator.count() > 0:
                # Look for nearby story link
                parent = locator.first.locator("xpath=ancestor::div[1]")
                link = parent.locator("a[href*='/story'], a[href*='/articles/']").first
                if await link.count() > 0:
                    href = await link.get_attribute("href")
                    if href:
                        if not href.startswith("http"):
                            href = BASE_URL + (href if href.startswith("/") else "/" + href)
                        return href
    except Exception:
        pass

    return None

# Optional helper for future: logout if needed
async def _logout(page: Page) -> None:
    try:
        logout = page.get_by_text("logout", exact=False).first
        if await logout.count() > 0:
            await logout.click()
    except Exception:
        pass

async def main():
    creds = generate_random_credentials()
    print("=" * 60)
    print("GENERATED CREDENTIALS FOR REGISTRATION:")
    print(f"Username: {creds['username']}")
    print(f"Email:    {creds['email']}")
    print(f"Password: {creds['password']}")
    print("=" * 60)
    
    manager = StealthBrowserManager()
    print("Launching stealth browser...")
    await manager.start()
    
    try:
        page = await manager.get_page()
        
        print("Navigating to https://www.bookmarks2u.com/register/ ...")
        try:
            await page.goto("https://www.bookmarks2u.com/register/", wait_until="commit", timeout=60000)
        except Exception as e:
            print(f"Initial navigation: {e}")
            
        print("Waiting for page load / Cloudflare bypass...")
        await bypass_cloudflare(page)
        await page.wait_for_timeout(200)
        
        print("Waiting for registration form...")
        await page.wait_for_selector("#user_login", timeout=30000)
        
        # Fill in the registration fields
        print("Filling registration fields...")
        await page.locator("#user_login").fill(creds["username"])
        await page.locator("#user_email").fill(creds["email"])
        await page.locator("#user_password").fill(creds["password"])
        await page.locator("#user_cpassword").fill(creds["password"])
        await page.locator("#nickname").fill(creds["username"])
        
        # Solve reCAPTCHA automatically
        sitekey = "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId"
        token = await solve_recaptcha_2captcha(page.url, sitekey)
        
        if token:
            print("Injecting reCAPTCHA token...")
            await page.evaluate(f"""(token) => {{
                const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
                fields.forEach(el => {{
                    el.value = token;
                    el.innerHTML = token;
                }});
                if (typeof ___grecaptcha_cfg !== 'undefined' && ___grecaptcha_cfg.clients) {{
                    for (const client of Object.values(___grecaptcha_cfg.clients)) {{
                        for (const prop of Object.values(client)) {{
                            if (prop && typeof prop.callback === 'function') {{
                                try {{ prop.callback(token); }} catch(e) {{}}
                            }}
                        }}
                    }}
                }}
            }}""", token)
            await page.wait_for_timeout(200)
            
            print("Submitting the registration form...")
            submit_btn = page.locator("input[value='Register'], input[type='submit'], #wp-submit")
            await submit_btn.first.click()
            
            print("Waiting for registration submission to complete...")
            try:
                await page.wait_for_load_state("networkidle", timeout=6000)
            except Exception:
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=4000)
                except Exception:
                    pass
            
            print(f"URL after registration: {page.url}")
            
            # Navigate to submit bookmark page
            print("Navigating to https://www.bookmarks2u.com/submit/ ...")
            try:
                await page.goto("https://www.bookmarks2u.com/submit/", wait_until="commit", timeout=60000)
            except Exception as e:
                print(f"Error navigating to submit: {e}")
                
            await bypass_cloudflare(page)
            await page.wait_for_timeout(200)
            print(f"Current URL at submit: {page.url}")
            
            print("Waiting for submission form fields to render...")
            try:
                await page.wait_for_selector("#articleUrl, #user_login, #login_user, input[name*='user']", timeout=15000)
            except Exception:
                pass
                
            # Define submission values
            client_site = "https://example.com"
            keyword = "Digital Marketing Guidelines"
            
            # Ensure title is at least 30 characters (required by bookmarks2u/SubmitPro validation config)
            title = keyword
            if len(title) < 30:
                title = f"{title} - Useful Resource and Discussion Link"

            print("Filling the article submission form fields...")
            # Fill Website/URL field
            url_field = page.locator("#articleUrl")
            if await url_field.count() > 0:
                await url_field.first.fill(client_site)
            else:
                print("Could not find articleUrl field.")
                
            # Fill Title field
            title_field = page.locator("#submitpro_title")
            if await title_field.count() > 0:
                await title_field.first.fill(title)
            else:
                print("Could not find submitpro_title field.")

            # Select Category using Select2 with fallback
            category_container = page.locator("[id*='submitpro_category-container'], #select2-submitpro_category-container, .select2-submitpro_category-container")
            if await category_container.count() > 0:
                try:
                    print("Clicking select2 category container...")
                    await category_container.first.click()
                    try:
                        await page.wait_for_selector(".select2-results__option:not(.select2-results__message)", timeout=2000)
                    except Exception:
                        pass
                    options = page.locator(".select2-results__option:not(.select2-results__message)")
                    if await options.count() > 1:
                        print(f"Found {await options.count()} options, clicking the first actual choice...")
                        await options.nth(1).click()
                    elif await options.count() > 0:
                        print(f"Found {await options.count()} options, clicking the first valid one...")
                        await options.first.click()
                    else:
                        print("No select2 options found in dropdown, using keyboard Enter fallback...")
                        await page.keyboard.press("ArrowDown")
                        await page.wait_for_timeout(100)
                        await page.keyboard.press("Enter")
                except Exception as e:
                    print(f"Error selecting category select2 dropdown: {e}")
            else:
                print("Select2 category container not found, trying fallback standard select element...")
                cat_select = page.locator("#submitpro_category, select[name*='category']")
                if await cat_select.count() > 0:
                    try:
                        await cat_select.first.select_option(index=1)
                    except Exception as select_err:
                        print(f"Failed standard select fallback: {select_err}")

            # Fill Tags field
            tags_field = page.locator("#tagsinput, .tagsinput, input[name='tagsinput'], input[name*='tags']")
            if await tags_field.count() > 0:
                await tags_field.first.fill("seo, marketing, backlinks")
            else:
                print("Could not find tagsinput field.")

            # Select Location using Select2 with fallback
            location_container = page.locator("[id*='submitpro_location-container'], #select2-submitpro_location-container, .select2-submitpro_location-container")
            if await location_container.count() > 0:
                try:
                    print("Clicking select2 location container...")
                    await location_container.first.click()
                    try:
                        await page.wait_for_selector(".select2-results__option:not(.select2-results__message)", timeout=2000)
                    except Exception:
                        pass
                    options = page.locator(".select2-results__option:not(.select2-results__message)")
                    if await options.count() > 1:
                        print(f"Found {await options.count()} options, clicking the first actual choice...")
                        await options.nth(1).click()
                    elif await options.count() > 0:
                        print(f"Found {await options.count()} options, clicking the first valid one...")
                        await options.first.click()
                    else:
                        print("No select2 options found in dropdown, using keyboard Enter fallback...")
                        await page.keyboard.press("ArrowDown")
                        await page.wait_for_timeout(100)
                        await page.keyboard.press("Enter")
                except Exception as e:
                    print(f"Error selecting location select2 dropdown: {e}")
            else:
                print("Select2 location container not found, trying fallback standard select element...")
                loc_select = page.locator("#submitpro_location, select[name*='location']")
                if await loc_select.count() > 0:
                    try:
                        await loc_select.first.select_option(index=1)
                    except Exception as select_err:
                        print(f"Failed standard select fallback: {select_err}")

            # Fill Email field
            email_field = page.locator("#submitpro_email, input[name*='email']")
            if await email_field.count() > 0:
                await email_field.first.fill(creds["email"])
            else:
                print("Could not find submitpro_email field.")

            # Fill Phone field
            phone_field = page.locator("#submitpro_phone, input[name*='phone']")
            if await phone_field.count() > 0:
                await phone_field.first.fill("+1 555-0199")
            else:
                print("Could not find submitpro_phone field.")

            # Fill Address field
            address_field = page.locator("#submitpro_address, textarea[name*='address'], input[name*='address']")
            if await address_field.count() > 0:
                await address_field.first.fill("123 SEO Boulevard, Suite 100")
            else:
                print("Could not find submitpro_address field.")

            # Fill Description field
            desc_field = page.locator("#submitpro_desc, textarea[name*='desc']")
            if await desc_field.count() > 0:
                description_text = (
                    f"Digital marketing is a multifaceted strategy designed to reach, engage, and convert customers online. "
                    f"In today's highly competitive digital landscape, businesses must utilize a variety of tactics to establish a robust online presence. "
                    f"Search Engine Optimization (SEO) is at the core of this effort, focusing on improving a website's visibility in organic search results. "
                    f"By optimizing on-page elements such as title tags, meta descriptions, and header tags, and by creating high-quality, relevant content, "
                    f"companies can attract targeted traffic. Furthermore, off-page optimization, primarily through link building, plays a crucial role in establishing domain authority. "
                    f"In addition to SEO, content marketing, social media marketing, email campaigns, and pay-per-click (PPC) advertising are essential components of a comprehensive digital marketing strategy. "
                    f"Content marketing involves creating and sharing valuable free content to attract and convert prospects into customers. "
                    f"Social media marketing allows brands to connect directly with their audience on platforms like Facebook, LinkedIn, and Instagram. "
                    f"Email marketing remains one of the most effective channels for nurturing leads and driving repeat business. "
                    f"Paid advertising campaigns offer immediate visibility and can be precisely targeted to specific demographics. "
                    f"Integrating these diverse channels into a cohesive, data-driven plan enables businesses to optimize their marketing budget and maximize return on investment. "
                    f"Regular analysis of key performance metrics, such as traffic, bounce rate, conversion rate, and customer acquisition cost, is critical for continuous improvement. "
                    f"Ultimately, successful digital marketing for keyword {keyword} requires a deep understanding of the target audience, consistency in messaging, and agility to adapt to evolving search engine algorithms and industry trends."
                )
                await desc_field.first.fill(description_text)
            else:
                print("Could not find submitpro_desc field.")

            # Handle Checkbox: agree-checkbox
            agree_checkbox = page.locator("#agree-checkbox, input[name='agree'], input[type='checkbox']")
            if await agree_checkbox.count() > 0:
                print("Checking agreement/terms checkbox...")
                try:
                    await page.evaluate("() => { const cb = document.querySelector('#agree-checkbox') || document.querySelector('input[type=\"checkbox\"]'); if (cb) { cb.click(); if(!cb.checked) cb.checked = true; } }")
                except Exception as cb_err:
                    print(f"Failed checking agree checkbox: {cb_err}")

            # Wait to settle
            await page.wait_for_timeout(200)

            # Solve CAPTCHA on submission page
            print("Locating sitekey on submission page...")
            site_key = None
            grecaptcha_element = page.locator("[data-sitekey]").first
            if await grecaptcha_element.count() > 0:
                site_key = await grecaptcha_element.get_attribute("data-sitekey")
            
            if not site_key:
                iframe = page.locator("iframe[src*='recaptcha/api2/anchor']").first
                if await iframe.count() > 0:
                    src = await iframe.get_attribute("src")
                    import urllib.parse as urlparse
                    parsed = urlparse.urlparse(src)
                    site_key = urlparse.parse_qs(parsed.query).get('k', [None])[0]
            
            if not site_key:
                site_key = "6LeeMUYUAAAAAF34b51Fq6QIq4eG-zHJKx6g6BId"
                
            print(f"Solving submission reCAPTCHA with sitekey: {site_key}")
            token = await solve_recaptcha_2captcha(page.url, site_key)
            if token:
                print("Injecting reCAPTCHA token into submit page...")
                try:
                    await page.evaluate(f"""(token) => {{
                        const fields = document.querySelectorAll('[name="g-recaptcha-response"], #g-recaptcha-response');
                        fields.forEach(el => {{
                            el.value = token;
                            el.innerHTML = token;
                            el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                            el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        }});
                    }}""", token)
                    await page.wait_for_timeout(200)
                except Exception as eval_err:
                    print(f"Error injecting token into submit page: {eval_err}")
            else:
                print("Failed to get recaptcha token from 2captcha.")

            # Submit the form
            submit_btn = page.locator("input[value='Preview & Submit'], input[type='submit'], #submitpro_submit_btn").first
            if await submit_btn.count() > 0:
                print("Clicking submission preview button...")
                os.makedirs("scratch", exist_ok=True)
                await page.screenshot(path="scratch/before_submit.png")
                await submit_btn.click()
                try:
                    await page.wait_for_selector("input[value='Submit'], input[value='Confirm'], button:has-text('Submit'), button:has-text('Confirm')", timeout=5000)
                except Exception:
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=5000)
                    except Exception:
                        pass
                print(f"Current page URL after preview submit: {page.url}")
                print(f"Registration credentials for checking: Username: {creds['username']}, Password: {creds['password']}")
                await page.screenshot(path="scratch/after_submit_click.png")
            else:
                print("Submit button not found.")

            # Check if we are on a confirmation page/preview page and need to do final submit
            confirm_btn = page.locator("input[value='Submit'], input[value='Confirm'], button:has-text('Submit'), button:has-text('Confirm')").first
            if await confirm_btn.count() > 0:
                print(f"Preview/Confirmation page detected at {page.url}. Clicking final submit...")
                await confirm_btn.click()
                try:
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                except Exception:
                    pass
                await page.screenshot(path="scratch/after_confirm_click.png")

            # Try to extract the resulting backlink
            current_url = page.url
            print(f"Final submission URL: {current_url}")
            
            backlink_url = await _extract_backlink_url(page)

            if backlink_url:
                print(f"\nSUCCESS! Created backlink URL: {backlink_url}")
                print(f"Account Username: {creds['username']}")
                print(f"Account Password: {creds['password']}")
            else:
                print("\nCould not extract created backlink URL. Please check manually.")
                print(f"Account Username: {creds['username']}")
                print(f"Account Password: {creds['password']}")
                print("Dumping page HTML for debug...")
                try:
                    os.makedirs("scratch", exist_ok=True)
                    with open("scratch/failed_page.html", "w", encoding="utf-8") as f:
                        f.write(await page.content())
                    await page.screenshot(path="scratch/final_page.png")
                except Exception as debug_err:
                    print(f"Error dumping debug info: {debug_err}")
        else:
            print("Unable to solve reCAPTCHA.")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        print("Closing browser...")
        try:
            await manager.close()
        except:
            pass

if __name__ == "__main__":
    asyncio.run(main())
