import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

// Setup for interactive tests - skip auth and backend
test.describe('Interactive UI Tests', () => {
  test.beforeEach(async ({ context }) => {
    // 1) Pretend we're logged in with a valid-looking JWT
    await context.addInitScript(() => {
      // Create a fake but valid-looking JWT token (header.payload.signature)
      const fakeJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZXhwIjo5OTk5OTk5OTk5fQ.fake-signature';
      localStorage.setItem('hbuk_token', fakeJWT);
    });

    // 2) Stub network for /api/commit (so no real backend)
    await context.route('**/api/commit', async route => {
      // minimal successful payload your UI expects
      const fake = {
        id: 'smoke-id',
        _id: 'smoke-id',
        content: 'smoke content',
        createdAt: new Date().toISOString(),
        digest: 'deadbeefcafebabe1234',
        signature: 'sig',
      };
      await route.fulfill({ status: 200, json: fake });
    });

    // 3) Stub /api/entries for initial load
    await context.route('**/api/entries', async route => {
      await route.fulfill({ status: 200, json: { entries: [] } });
    });
  });

  test('HBUK UI smoke (interactive)', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    const editor = page.locator('#editor');
    const wordCount = page.locator('#wordCount');
    const commitBtn = page.locator('#commitBtn');

    // Basic visibility
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(wordCount).toBeVisible();
    await expect(commitBtn).toBeVisible();

    // Word count functionality
    await editor.fill('hello world');
    await expect(wordCount).toHaveText(/2 words?/i);

    // Focus toggle works
    const focusBtn = page.getByRole('button', { name: /focus/i });
    await focusBtn.click();
    await expect(page.locator('body')).toHaveClass(/focus/);
    
    // Esc exits focus mode
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/focus/);

    // Commit path shows green confirmation
    await editor.fill('test commit');
    await commitBtn.click();
    await expect(page.locator('#commitNotice, .notif')).toContainText(/Committed|Digest/i, { timeout: 5000 });
    
    console.log('✅ Interactive UI test passed - all functionality working');
  });

  test('HBUK commit pill animation - green confirmation fades', async ({ page }) => {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    const editor = page.locator('#editor');
    const commitBtn = page.locator('#commitBtn');
    const commitNotice = page.locator('#commitNotice');

    // Wait for elements to be ready
    await expect(editor).toBeVisible({ timeout: 10000 });
    await expect(commitBtn).toBeVisible();

    // Type and commit
    await editor.fill('test pill animation');
    await commitBtn.click();

    // Green pill should appear with confirmation
    await expect(commitNotice).toBeVisible({ timeout: 5000 });
    await expect(commitNotice).toContainText(/Committed|Digest/i);

    // Pill should auto-hide after ~2s (with some tolerance)
    await expect(commitNotice).toBeHidden({ timeout: 8000 });
    
    console.log('✅ Commit pill animation verified');
  });
});

test('HBUK UI smoke - critical elements and functionality', async ({ page }) => {
  // Read the index.html file directly to verify structure
  // This prevents the "static page" issue by verifying critical elements exist
  const indexPath = join(process.cwd(), 'index.html');
  const htmlContent = readFileSync(indexPath, 'utf-8');
  
  console.log('Checking index.html for critical elements...');
  
  // Verify critical elements exist in the HTML
  // This prevents the "static page" issue we're trying to solve
  expect(htmlContent).toContain('id="editor"');
  expect(htmlContent).toContain('id="commitBtn"');
  expect(htmlContent).toContain('id="wordCount"');
  expect(htmlContent).toContain('id="entries"');
  expect(htmlContent).toContain('id="focusToggle"');
  
  // Verify module scripts are present
  expect(htmlContent).toContain('src="api-utils.js"');
  expect(htmlContent).toContain('src="script.js"');
  
  // Verify export buttons exist
  expect(htmlContent).toContain('id="exportJsonBtn"');
  expect(htmlContent).toContain('id="exportPdfBtn"');
  
  console.log('✅ All critical elements found in index.html');
});

test('HBUK module scripts loaded - no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Try to load the page, but don't fail if redirected
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  
  // Wait a moment for scripts to load
  await page.waitForTimeout(2000);
  
  // Should have no console errors
  expect(consoleErrors).toHaveLength(0);
});

test('HBUK commit row structure - prevents static page regressions', async ({ page }) => {
  // Read the index.html file directly to verify structure
  const indexPath = join(process.cwd(), 'index.html');
  const htmlContent = readFileSync(indexPath, 'utf-8');
  
  // Verify the commit row structure exists exactly as expected
  expect(htmlContent).toContain('class="commitRow"');
  expect(htmlContent).toContain('id="notif"');
  expect(htmlContent).toContain('id="commitBtn"');
  expect(htmlContent).toContain('id="commitNotice"');
  
  // Verify the commit button text
  expect(htmlContent).toContain('Commit ↵');
  
  // Verify the protective comments are present
  expect(htmlContent).toContain('HBUK CRITICAL: Commit row with button - DO NOT REMOVE');
  expect(htmlContent).toContain('HBUK CRITICAL: Module scripts - DO NOT REMOVE');
  
  console.log('✅ Commit row structure verified in index.html');
});
