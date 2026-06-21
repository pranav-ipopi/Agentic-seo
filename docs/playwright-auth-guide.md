# Playwright Authentication & Session Management Guide

When automating web applications (like Medium) that require users to be logged in, the primary challenge is managing authentication states—especially when the automation runs headlessly on a remote server or as a service for multiple users.

This document outlines the standard architectures and methods for solving this problem.

## 1. Running on a Cloud VPS (Single User)

When you deploy a Playwright script to a VPS, it runs in a headless environment without a UI. You cannot manually type your password or solve CAPTCHAs.

### Workflow:
1. **Export State Locally**: On your local machine where you have a UI, run Playwright's codegen tool to generate the session file:
   ```bash
   npx playwright codegen https://medium.com --save-storage=auth.json
   ```
   Log in through the popup browser. Once closed, `auth.json` will contain your cookies.

2. **Update the Script**: Instruct your Playwright test to load the session before starting.
   ```typescript
   import { test } from '@playwright/test';

   // Inject the saved session
   test.use({ storageState: 'auth.json' });

   test('Automated Task', async ({ page }) => {
     await page.goto('https://medium.com/new-story');
     // ... script logic
   });
   ```

3. **Deploy**: Upload your script, `package.json`, and the `auth.json` file to your VPS. When you run `npx playwright test` on the server, it will already be logged in.

---

## 2. Next.js SaaS Architecture (Multi-User)

If you are building an Automation-as-a-Service platform (e.g., in Next.js) where users automate tasks on third-party sites using their own accounts, you need a scalable way to capture and reuse their sessions. 

Because of strict web security (CORS, `X-Frame-Options`), you cannot securely embed third-party login pages directly into your frontend via `iframes`.

### Approach A: The "Cloud Browser" (Streaming)
This is the most seamless but technically demanding approach.
1. **Initiate**: The user clicks "Connect Account" in your Next.js app.
2. **Stream**: Your backend spins up a Playwright browser and streams the graphical output to your frontend via WebRTC or Canvas (similar to Kasm or Browserless.io).
3. **Login**: The user interacts with this "virtual" browser to log in.
4. **Capture**: Once logged in, your backend extracts the state using `const state = await context.storageState()` and saves it to your database.

### Approach B: The "Browser Extension" (Recommended)
This is the standard approach used by many automation SaaS platforms because it bypasses the need for complex browser streaming.
1. **Install**: The user installs your custom Chrome Extension.
2. **Native Login**: The user logs into the target site (e.g., Medium) natively on their own browser.
3. **Sync**: The extension reads the active session cookies for that specific domain and securely POSTs them to your Next.js API.
4. **Capture**: Your backend stores the session JSON in the database.

---

## 3. Executing the Multi-User Automation

When a scheduled task fires on your backend, you dynamically launch Playwright using the user's saved state directly from memory.

```typescript
// 1. Fetch the user's encrypted session from your DB
const userSessionJson = await database.getUserSession(userId);

// 2. Launch a new context using their session directly
const context = await browser.newContext({ 
  storageState: userSessionJson 
});

// 3. Execute the task
const page = await context.newPage();
await page.goto('https://medium.com/new-story');
// The browser is now fully authenticated as the user!
```

---

> [!WARNING]
> **Security Considerations**
> Session cookies are highly sensitive and are the equivalent of a user's raw password.
> - **Encryption**: You **must** encrypt the session JSON at rest in your database (e.g., AES-256).
> - **Expiration**: Understand that sessions eventually expire. Your application needs a flow to alert users when their connection drops so they can re-authenticate.
> - **Scope**: If using a browser extension, ensure you only request permissions for the specific domains you are automating, to protect user privacy.
