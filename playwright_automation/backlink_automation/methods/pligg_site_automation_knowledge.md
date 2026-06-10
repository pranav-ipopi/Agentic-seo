# Pligg Site Automation Knowledge (LiveBookmarking Template)

This document captures the exact steps, robust logic, and best practices developed while automating the backlink submission process on `livebookmarking.com`. Because LiveBookmarking uses the Pligg (or Kliqqi) CMS architecture, this knowledge is highly reusable for other similar social bookmarking sites.

## 1. Registration Flow & Credentials
- **Username Generation**: Some Pligg sites fail registration if the username contains special characters (like underscores). Always use purely alphanumeric random strings (e.g., `backlink{8_random_chars}`).
- **Auto-Login via Redirect**: After a successful registration on Pligg sites, you typically do not need to explicitly navigate to a `/login` route. The site usually logs the user in automatically and redirects them to their user profile page (`/user/{user-id}`).
- **Success Verification**: Check `page.url` for `/user/` after clicking the "Create user" button to confidently confirm successful registration without having to parse complex UI elements.

## 2. Robust Captcha Solving (SolveMedia via 2Captcha)
Pligg sites frequently use **SolveMedia** captchas, which appear as an image puzzle requiring text input.
- **Targeting the Image**: The image is often embedded inside an iframe (`#adcopy-puzzle-image-image iframe`). To capture it:
  1. Access the iframe wrapper via Playwright's `frame_locator`.
  2. Locate the `img` element inside that iframe.
  3. Screenshot the element to a local file (e.g., `solvemedia_captcha.png`).
- **2Captcha API Integration**: Send the local screenshot to the 2Captcha service via the `twocaptcha` library. The `solver.normal(image_path)` method returns a dictionary where the `'code'` key contains the solved text.
- **Filling the Response**: Fill the solved text into the `#adcopy_response` input field on the main page. Wait briefly (`~1000ms`) before clicking submit to ensure the site's JS registers the input natively.

## 3. Handling Invalid Captchas (Retry Logic)
Captcha-solving APIs are not 100% accurate. Pligg sites will reject the form submission and display an "invalid captcha" or "wrong answer" error message.
- **Loop Architecture**: Wrap the form-filling and captcha-solving logic inside a `for attempt in range(max_retries):` loop (usually 3 retries).
- **Error Detection**: After clicking submit, wait for network idle and check the `page.inner_text("body")` for phrases like `"invalid captcha"`, `"captcha...invalid"`, or `"wrong answer"`.
- **Refill Behavior**: If an invalid captcha is detected, `continue` the loop. You must refill the *entire form* (username, email, password, etc. or title, tags, description) because Pligg sites often clear form values upon a captcha failure.

## 4. The Two-Step Bookmark Submission Process
Submitting a bookmark on Pligg sites usually happens in two distinct steps under the `/submit` route.

**Step 1: URL Validation**
- Locate the URL field (typically `#url`, `input[name='url']`, or `input[type='url']`).
- Fill in the target client site URL.
- Click the "Continue" button (often `input[value='Continue']` or `input[type='submit']`). Wait for DOM load.

**Step 2: Article Details & Final Submit**
- The site will load the second phase of the form.
- Fill in the required fields:
  - **Title**: `#title` (Use the target keyword)
  - **Tags**: `#tags` (Use keyword-specific tags)
  - **Description**: `#bodytext` (A natural sentence including the keyword)
  - **Category**: Attempt to select an option (e.g., `index=1`) from the `#category` dropdown if present.
- **Second Captcha**: There is almost always a second SolveMedia captcha at the bottom of this page. Reuse the 2Captcha solving logic here.
- **Final Submission**: Click the "Save Changes and Submit" button (`input[value='Save Changes and Submit']` or `.submit`).

## 5. Extracting the Final Backlink
After the final submission, Pligg sites redirect to the newly created story page.
- **Detection Strategy**: Wait for the network to idle, then check if `page.url` contains `/story`. If it does, `page.url` is your final backlink URL.
- **Fallback**: If the redirect is slow or unclear, search the DOM for `a[href*='/story']` near success text (like `"submitted"`, `"published"`, or `"success"`).

## Summary Checklist for New Pligg Templates:
- [ ] Generate alphanumeric usernames (no special characters).
- [ ] Wrap Registration in a 3-try loop catching `"invalid captcha"`.
- [ ] Verify registration success by checking for `/user/` in the URL.
- [ ] Wrap Submission in a 3-try loop catching `"invalid captcha"`.
- [ ] Implement the two-step URL -> Details submit flow.
- [ ] Extract the final backlink from the `/story` URL.
