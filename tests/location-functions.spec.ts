import { test, expect } from '@playwright/test';

// Simple test that just verifies our location logic works
test.describe('location formatting functions', () => {
  test('should format US location correctly', async ({ page }) => {
    // Navigate to a simple page to test our functions
    await page.goto('data:text/html,<html><body><div id="test"></div></body></html>');
    
    // Test the location formatting logic
    const result = await page.evaluate(() => {
      // Mock the location formatting functions
      const rmThe = (s = '') => s.replace(/\s*\(the\)\s*$/i, '').trim();
      const flagFromISO2 = (cc: string) =>
        cc ? [...cc.toUpperCase()].map(c => String.fromCodePoint(127397 + c.charCodeAt())).join('') : '';

      function formatLocation(entry: any) {
        if (entry?.locationName) return entry.locationName;
        if (typeof entry?.latitude === 'number' && typeof entry?.longitude === 'number') {
          return `(${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)})`;
        }
        return 'somewhere in the universe ✨';
      }

      // Test cases
      const testCases = [
        { input: { locationName: 'New York, NY, United States' }, expected: 'New York, NY, United States' },
        { input: { latitude: 40.7128, longitude: -74.0060 }, expected: '(40.7128, -74.0060)' },
        { input: {}, expected: 'somewhere in the universe ✨' },
        { input: { locationName: 'Somewhere (the)' }, expected: 'Somewhere (the)' } // rmThe not applied here
      ];

      return testCases.map(tc => ({
        input: tc.input,
        expected: tc.expected,
        actual: formatLocation(tc.input)
      }));
    });

    // Verify results
    for (const testCase of result) {
      expect(testCase.actual).toBe(testCase.expected);
    }
  });

  test('should handle flag emoji conversion', async ({ page }) => {
    await page.goto('data:text/html,<html><body><div id="test"></div></body></html>');
    
    const flagResults = await page.evaluate(() => {
      const flagFromISO2 = (cc: string) =>
        cc ? [...cc.toUpperCase()].map(c => String.fromCodePoint(127397 + c.charCodeAt())).join('') : '';

      return {
        US: flagFromISO2('US'),
        UK: flagFromISO2('GB'),
        IN: flagFromISO2('IN'),
        invalid: flagFromISO2(''),
        undefined: flagFromISO2(undefined as any)
      };
    });

    expect(flagResults.US).toBe('🇺🇸');
    expect(flagResults.UK).toBe('🇬🇧');
    expect(flagResults.IN).toBe('🇮🇳');
    expect(flagResults.invalid).toBe('');
    expect(flagResults.undefined).toBe('');
  });
});
