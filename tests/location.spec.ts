import { test, expect } from '@playwright/test';
import { login, stubReverseGeocode, commit } from './helpers';

test.describe('pretty location + fallback', () => {
  test.beforeEach(async ({ context, page }) => {
    // grant location by default; individual tests can override
    await context.grantPermissions(['geolocation']);
    await login(page);
  });

  test('United States with flag', async ({ context, page }) => {
    await context.setGeolocation({ latitude: 40.7128, longitude: -74.0060 }); // NYC
    await stubReverseGeocode(page, {
      locality: 'New York', city: 'New York', principalSubdivision: 'New York', countryName: 'United States'
    });
    await commit(page, 'US location check');
    const meta = page.locator('#entries .entry:first-of-type .badge', { hasText: 'Committed on' });
    await expect(meta).toContainText('United States');
    await expect(meta).toContainText('🇺🇸');
  });

  test('United Kingdom with flag', async ({ context, page }) => {
    await context.setGeolocation({ latitude: 51.5074, longitude: -0.1278 }); // London
    await stubReverseGeocode(page, {
      locality: 'London', city: 'London', principalSubdivision: 'England', countryName: 'United Kingdom'
    });
    await commit(page, 'UK location check');
    const meta = page.locator('#entries .entry:first-of-type .badge', { hasText: 'Committed on' });
    await expect(meta).toContainText('United Kingdom');
    await expect(meta).toContainText('🇬🇧');
  });

  test('India with flag', async ({ context, page }) => {
    await context.setGeolocation({ latitude: 12.9716, longitude: 77.5946 }); // Bengaluru
    await stubReverseGeocode(page, {
      locality: 'Bengaluru', city: 'Bengaluru', principalSubdivision: 'Karnataka', countryName: 'India'
    });
    await commit(page, 'India location check');
    const meta = page.locator('#entries .entry:first-of-type .badge', { hasText: 'Committed on' });
    await expect(meta).toContainText('India');
    await expect(meta).toContainText('🇮🇳');
  });

  test('no location → "somewhere in the universe ✨"', async ({ context, page }) => {
    await context.clearPermissions(); // deny geolocation
    await commit(page, 'no location check');
    const meta = page.locator('#entries .entry:first-of-type .badge', { hasText: 'Committed on' });
    await expect(meta).toContainText('somewhere in the universe ✨');
  });
});
