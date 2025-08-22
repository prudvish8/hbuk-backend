import { test, expect } from '@playwright/test';

test('UI smoke - critical elements and functionality', async ({ page }) => {
  // Load the main page
  await page.goto('/');
  
  // 1. Critical DOM elements must exist
  await expect(page.locator('#commitBtn')).toBeVisible();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#wordCount')).toBeVisible();
  await expect(page.locator('#entries')).toBeVisible();
  await expect(page.locator('#focusToggle')).toBeVisible();
  
  // 2. JavaScript is working - word count updates
  await page.locator('#editor').fill('hello world');
  await expect(page.locator('#wordCount')).toHaveText(/2 words/);
  
  // 3. Focus mode toggle works
  const focusBtn = page.getByRole('button', { name: /focus/i });
  await focusBtn.click();
  await expect(page.locator('body')).toHaveClass(/focus/);
  
  // 4. Focus mode shows commit button
  await expect(page.locator('#commitBtn')).toBeVisible();
  
  // 5. Exit focus mode
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/focus/);
  
  // 6. Export buttons exist
  await expect(page.locator('#exportJsonBtn')).toBeVisible();
  await expect(page.locator('#exportPdfBtn')).toBeVisible();
});

test('Module scripts loaded - no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  await page.goto('/');
  
  // Wait a moment for scripts to load
  await page.waitForTimeout(1000);
  
  // Should have no console errors
  expect(consoleErrors).toHaveLength(0);
  
  // Critical: commit button should be clickable (not disabled)
  const commitBtn = page.locator('#commitBtn');
  await expect(commitBtn).toBeEnabled();
});
