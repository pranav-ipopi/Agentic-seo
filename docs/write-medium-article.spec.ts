import { test, expect } from '@playwright/test';

// This test assumes you are using the Playwright MCP or a configured storageState
// to automatically persist your Medium login session.
// Reference: https://playwright.dev/mcp/configuration/user-profile
test('Write a Medium article automatically', async ({ page }) => {
  // Navigate to the Medium "New Story" page
  await page.goto('https://medium.com/new-story');

  // The Medium editor uses a contenteditable textbox
  await page.getByRole('textbox').first().click();
  await page.keyboard.type('My Automated Test Article');
  await page.keyboard.press('Enter');

  // Fill in the story body
  await page.keyboard.type('This article was written automatically using a Playwright automation script!');
  await page.keyboard.press('Enter');

  // To publish, you would uncomment the following lines:
  // await page.getByRole('button', { name: 'Publish' }).click();
});
