import { test, expect } from '@playwright/test'

/**
 * Protected routes must not be reachable without a session. This is the one
 * spec that needs no credentials, so it runs on every checkout — it starts
 * from an explicitly empty storage state rather than inheriting the project's,
 * so it stays unauthenticated even when E2E_EMAIL / E2E_PASSWORD are set.
 *
 * API Keys is the sharpest case: the page lists key metadata for an entire
 * org, so an auth regression here leaks across tenants.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const PROTECTED = ['/agents/api-keys', '/agents/api-playground', '/agents/org', '/agents']

for (const path of PROTECTED) {
  test(`${path} redirects an anonymous visitor away`, async ({ page }) => {
    await page.goto(path)

    // Wherever the app sends them, it must not be the protected page, and no
    // key material or org data may render.
    await expect(page).not.toHaveURL(new RegExp(`${path}/?$`))
    await expect(page.getByTestId('api-key-row')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create key' })).toHaveCount(0)
  })
}

// The keys API itself must reject a cookieless caller — the page redirect
// above is presentation, this is the actual tenancy boundary.
test('GET /api/keys rejects an unauthenticated caller', async ({ request }) => {
  const res = await request.get('/api/keys')
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(res.status()).toBeLessThan(500)

  const body = await res.text()
  expect(body).not.toContain('key_prefix')
})

// Mutations must be rejected too, not just reads.
test('POST /api/keys rejects an unauthenticated caller', async ({ request }) => {
  const res = await request.post('/api/keys', {
    data: { name: 'anon', environment: 'test', scopes: ['chat'] },
    failOnStatusCode: false,
  })
  expect(res.status()).toBeGreaterThanOrEqual(400)
  expect(res.status()).toBeLessThan(500)

  const body = await res.text()
  // A minted secret must never come back to an anonymous caller.
  expect(body).not.toMatch(/nd_(live|test)_|sk_(live|test)_/)
})
