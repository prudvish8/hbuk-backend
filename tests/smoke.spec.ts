import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

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
