import { expect, test } from '@playwright/test';
import { mockAnthropic, resetState, seedApiKey, TEST_PNG_BUFFER } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetState(page);
});

test('home page renders and prompts for API key when none is set', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'LexiBulle' })).toBeVisible();
  // No key yet → yellow "kein API-Schlüssel" alert is shown.
  await expect(page.getByText(/kein API-Schlüssel/i)).toBeVisible();
});

test('Settings: saving an API key tests it and shows success', async ({ page }) => {
  await mockAnthropic(page);

  await page.goto('/settings');
  await page.getByLabel(/API-Schlüssel/i).first().fill('sk-test-123');
  await page.getByRole('button', { name: /Speichern & Testen/i }).click();

  // Success toast from notifications.ts.
  await expect(page.getByText(/API-Schlüssel gespeichert/i)).toBeVisible();
  // Key persists across reloads (localStorage).
  await page.reload();
  const value = await page.evaluate(() => localStorage.getItem('anthropic_api_key'));
  expect(value).toBe('sk-test-123');
});

test('upload → analyze → region visible with translation', async ({ page }) => {
  await seedApiKey(page);
  await mockAnthropic(page);

  // Upload page — pick one tiny PNG, submit.
  await page.goto('/upload');
  await page.getByTestId('page-file-input').setInputFiles({
    name: 'p1.png',
    mimeType: 'image/png',
    buffer: TEST_PNG_BUFFER,
  });
  await page.getByTestId('upload-submit-btn').click();

  // Lands on /comics/:id reader.
  await expect(page).toHaveURL(/\/comics\/\d+/);

  // Kick off detect+analyze and wait for it to land.
  await page.getByTestId('detect-and-analyze-btn').click();

  // One mocked region rendered as an overlay box.
  const regionBox = page.getByTestId('region-rect');
  await expect(regionBox).toHaveCount(1, { timeout: 15_000 });

  // Click it to open the translation panel.
  await regionBox.click();
  await expect(page.getByTestId('region-card')).toBeVisible();
  // Translation is blurred until clicked.
  await page.getByText('Hallo!').click();
  await expect(page.getByText('Hallo!')).toBeVisible();
});

test('library persists uploaded comics across reloads', async ({ page }) => {
  await seedApiKey(page);
  await mockAnthropic(page);

  await page.goto('/upload');
  await page.getByTestId('upload-title-input').fill('Mon Comic');
  await page.getByTestId('page-file-input').setInputFiles({
    name: 'p1.png',
    mimeType: 'image/png',
    buffer: TEST_PNG_BUFFER,
  });
  await page.getByTestId('upload-submit-btn').click();
  await expect(page).toHaveURL(/\/comics\/\d+/);

  await page.goto('/library');
  await expect(page.getByTestId('comic-card')).toHaveCount(1);
  await expect(page.getByText('Mon Comic')).toBeVisible();

  // Reload the whole tab — IndexedDB is the source of truth.
  await page.reload();
  await expect(page.getByTestId('comic-card')).toHaveCount(1);
  await expect(page.getByText('Mon Comic')).toBeVisible();
});
