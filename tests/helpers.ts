import { Page } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/login.html');
  await page.fill('input[type="email"]', process.env.HBUK_TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.HBUK_TEST_PASSWORD!);
  await page.click('button[type="submit"], text=Login');
  await page.waitForURL('**/index.html');
}

export async function stubReverseGeocode(page: Page, reply: any) {
  await page.route('**/reverse-geocode-client**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
  );
}

export async function commit(page: Page, text: string) {
  await page.fill('#editor', text);
  await page.click('#commitBtn'); // the anchored pill has id="commitBtn"
  // wait for green confirmation to appear then fade (exists in DOM)
  await page.getByText('Committed ✓ Digest', { exact: false }).waitFor();
}
