import { test, expect, type Page } from '@playwright/test'

/**
 * API Keys end-to-end. These hit the real /api/keys routes, so every spec
 * cleans up the key it created — a leaked key would keep authenticating.
 *
 * Keys are named with a unique suffix so repeated runs never collide on a row
 * locator, and every key is minted in `test` mode so nothing is ever metered.
 */
// Every spec here needs a signed-in session. Without credentials there's no
// storage state, so skip rather than fail against the login redirect.
test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  'E2E_EMAIL / E2E_PASSWORD not set.',
)

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

/** The row for a given key name — anchored on a test id, not div nesting. */
const row = (page: Page, name: string) =>
  page.getByTestId('api-key-row').filter({ hasText: name })

/** Fill the inline create form and submit. Defaults to unmetered test mode. */
async function createKey(page: Page, name: string, env: 'live' | 'test' = 'test') {
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: env, exact: true }).click()
  await page.getByRole('button', { name: 'Create key' }).click()
}

/** Acknowledge the reveal panel so the list comes back. Returns the secret. */
async function dismissReveal(page: Page) {
  const secret = page.locator('code').filter({ hasText: /^(nd|sk)_/ }).first()
  await expect(secret).toBeVisible()
  const plaintext = (await secret.textContent())!.trim()
  await page.getByLabel("I've stored this key in a safe place").check()
  await page.getByRole('button', { name: 'Done' }).click()
  return plaintext
}

/** Delete the key, so the account is left as we found it. */
async function cleanUp(page: Page, name: string) {
  const actions = page.getByRole('button', { name: `Actions for ${name}` })
  if (!(await actions.isVisible().catch(() => false))) return
  await actions.click()
  await page.getByRole('button', { name: 'Delete key' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete key' }).click()
  await expect(row(page, name)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/agents/api-keys')
  await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
})

test('creates a key, reveals the secret once, and lists it', async ({ page }) => {
  const name = unique()
  try {
    await createKey(page, name)

    // Done is gated until the user confirms they stored it — this is the only
    // chance to copy the plaintext.
    const secret = page.locator('code').filter({ hasText: /^(nd|sk)_/ }).first()
    await expect(secret).toBeVisible()
    const plaintext = (await secret.textContent())!.trim()
    expect(plaintext.length).toBeGreaterThan(20)

    const done = page.getByRole('button', { name: 'Done' })
    await expect(done).toBeDisabled()
    await page.getByLabel("I've stored this key in a safe place").check()
    await expect(done).toBeEnabled()
    await done.click()

    // Listed, masked, and never showing the plaintext again.
    await expect(row(page, name)).toBeVisible()
    await expect(page.getByText(plaintext)).toHaveCount(0)
    await expect(row(page, name).getByText('test')).toBeVisible()
  } finally {
    await cleanUp(page, name)
  }
})

// "Shown once" has to survive a page load, not just a state transition — the
// secret is hashed server-side and must be unrecoverable from the listing.
test('never shows the secret again after a reload', async ({ page }) => {
  const name = unique()
  try {
    await createKey(page, name)
    const plaintext = await dismissReveal(page)

    await page.reload()
    await expect(row(page, name)).toBeVisible()
    await expect(page.getByText(plaintext)).toHaveCount(0)

    // The listing endpoint must not carry it either.
    const res = await page.request.get('/api/keys')
    expect(await res.text()).not.toContain(plaintext)
  } finally {
    await cleanUp(page, name)
  }
})

test('the row reflects the scopes the key was created with', async ({ page }) => {
  const name = unique()
  try {
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: 'test', exact: true }).click()
    // Drop `agents`, leaving `chat` only.
    await page.getByRole('button', { name: 'agents', exact: true }).click()
    await page.getByRole('button', { name: 'Create key' }).click()
    await dismissReveal(page)

    const scopes = row(page, name)
    await expect(scopes.getByText('chat', { exact: true })).toBeVisible()
    await expect(scopes.getByText('agents', { exact: true })).toHaveCount(0)
  } finally {
    await cleanUp(page, name)
  }
})

test('revoking asks first, then marks the key revoked', async ({ page }) => {
  const name = unique()
  try {
    await createKey(page, name)
    await dismissReveal(page)
    await expect(row(page, name)).toBeVisible()

    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('button', { name: 'Revoke key' }).click()

    // Dismissing leaves the key active.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Revoke this key?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep key' }).click()
    await expect(row(page, name).getByText('revoked')).toHaveCount(0)

    // Confirming revokes it, and the row stays listed as revoked.
    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('button', { name: 'Revoke key' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke key' }).click()
    await expect(row(page, name).getByText('revoked')).toBeVisible()

    // Survives a reload — persisted, not just an optimistic update.
    await page.reload()
    await expect(row(page, name).getByText('revoked')).toBeVisible()
  } finally {
    await cleanUp(page, name)
  }
})

// A revoked key must stop authenticating immediately, cache included.
test('a revoked key can no longer call the API', async ({ page }) => {
  const name = unique()
  try {
    await createKey(page, name)
    const plaintext = await dismissReveal(page)

    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('button', { name: 'Revoke key' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke key' }).click()
    await expect(row(page, name).getByText('revoked')).toBeVisible()

    // /api/v1/agents is POST-only; auth is rejected before any agent runs, so
    // this costs nothing even though the endpoint is metered for valid keys.
    const res = await page.request.post('/api/v1/agents', {
      headers: { Authorization: `Bearer ${plaintext}` },
      data: { messages: [] },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(401)
  } finally {
    await cleanUp(page, name)
  }
})

test('deleting removes the key from the list for good', async ({ page }) => {
  const name = unique()
  await createKey(page, name)
  await dismissReveal(page)
  await expect(row(page, name)).toBeVisible()

  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('button', { name: 'Delete key' }).click()

  // Cancelling keeps it.
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Delete this key?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(row(page, name)).toBeVisible()

  await page.getByRole('button', { name: `Actions for ${name}` }).click()
  await page.getByRole('button', { name: 'Delete key' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete key' }).click()
  await expect(row(page, name)).toHaveCount(0)

  await page.reload()
  await expect(row(page, name)).toHaveCount(0)
})

test('a name is required and at least one scope must stay selected', async ({ page }) => {
  const create = page.getByRole('button', { name: 'Create key' })
  await expect(create).toBeDisabled()

  await page.getByLabel('Name').fill(unique())
  await expect(create).toBeEnabled()

  await page.getByRole('button', { name: 'agents', exact: true }).click()
  await page.getByRole('button', { name: 'chat', exact: true }).click()
  await expect(page.getByText('Select at least one scope.')).toBeVisible()
  await expect(create).toBeDisabled()
})

test.describe('clipboard', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  // The row copy affordance must hand over the masked id — never a secret.
  test('copies the masked key id from the row', async ({ page }) => {
    const name = unique()
    try {
      await createKey(page, name)
      const plaintext = await dismissReveal(page)

      await page.getByRole('button', { name: `Copy key ID for ${name}` }).click()
      const copied = await page.evaluate(() => navigator.clipboard.readText())

      expect(copied.length).toBeGreaterThan(0)
      expect(copied).not.toBe(plaintext)
      expect(plaintext.startsWith(copied)).toBe(true) // a prefix, not the whole key
    } finally {
      await cleanUp(page, name)
    }
  })
})
