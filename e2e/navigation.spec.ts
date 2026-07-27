import { test, expect } from '@playwright/test'

// Every spec here needs a signed-in session. Without credentials there's no
// storage state, so skip rather than fail against the login redirect.
test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  'E2E_EMAIL / E2E_PASSWORD not set.',
)

/**
 * Sidebar navigation. "Developer" is a collapsible label, not a destination —
 * organizations aren't a supported product surface, so it must never navigate.
 */
test('Developer group expands and collapses without navigating', async ({ page }) => {
  await page.goto('/agents/api-keys')

  // The rail collapses to icons; hover to reveal the labels.
  await page.getByTestId('flyout-zone').hover()

  const header = page.getByRole('button', { name: 'Developer' })
  await expect(header).toBeVisible()
  await expect(header).toHaveAttribute('aria-expanded', 'true')

  const before = page.url()
  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'API Keys' })).toHaveCount(0)
  expect(page.url()).toBe(before)

  await header.click()
  await expect(page.getByRole('link', { name: 'API Keys' })).toBeVisible()
})

test('the API rows navigate to their pages', async ({ page }) => {
  await page.goto('/agents/api-keys')
  await page.getByTestId('flyout-zone').hover()

  await page.getByRole('link', { name: 'API Playground' }).click()
  await expect(page).toHaveURL(/\/agents\/api-playground/)
  await expect(page.getByRole('heading', { name: 'API Playground' })).toBeVisible()

  await page.getByTestId('flyout-zone').hover()
  await page.getByRole('link', { name: 'API Keys' }).click()
  await expect(page).toHaveURL(/\/agents\/api-keys/)
  await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
})
