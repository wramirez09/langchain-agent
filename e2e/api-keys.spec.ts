import { test, expect, type Page } from '@playwright/test'

/**
 * API Keys end-to-end. These hit the real /api/keys routes, so every spec
 * cleans up the key it created — a leaked live key would keep authenticating.
 *
 * Keys are named with a unique suffix so parallel or repeated runs never
 * collide on a row locator.
 */
// Every spec here needs a signed-in session. Without credentials there's no
// storage state, so skip rather than fail against the login redirect.
test.skip(
  !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD,
  'E2E_EMAIL / E2E_PASSWORD not set.',
)

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

/** The row for a given key name, scoped so actions never hit a sibling row. */
const row = (page: Page, name: string) =>
  page.locator('div').filter({ hasText: name }).last()

async function createKey(page: Page, name: string, env: 'live' | 'test' = 'test') {
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: env, exact: true }).click()
  await page.getByRole('button', { name: 'Create key' }).click()
}

/** Revoke + delete, so the account is left as we found it. */
async function cleanUp(page: Page, name: string) {
  const actions = page.getByRole('button', { name: `Actions for ${name}` })
  if (!(await actions.isVisible().catch(() => false))) return
  await actions.click()
  await page.getByRole('button', { name: 'Delete key' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete key' }).click()
  await expect(page.getByText(name)).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/agents/api-keys')
  await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
})

test('creates a key, reveals the secret once, and lists it', async ({ page }) => {
  const name = unique()
  try {
    await createKey(page, name)

    // The plaintext appears exactly once, and Done is gated until the user
    // confirms they stored it — this is the only chance to copy it.
    const secret = page.locator('code').filter({ hasText: /^nd_|^sk_/ }).first()
    await expect(secret).toBeVisible()
    const plaintext = (await secret.textContent())!.trim()
    expect(plaintext.length).toBeGreaterThan(20)

    const done = page.getByRole('button', { name: 'Done' })
    await expect(done).toBeDisabled()
    await page.getByLabel("I've stored this key in a safe place").check()
    await expect(done).toBeEnabled()
    await done.click()

    // Listed, masked, and never showing the plaintext again.
    await expect(page.getByText(name)).toBeVisible()
    await expect(page.getByText(plaintext)).toHaveCount(0)
    await expect(row(page, name).getByText('test')).toBeVisible()
  } finally {
    await cleanUp(page, name)
  }
})

test('revoking asks first, then marks the key revoked', async ({ page }) => {
  const name = unique()
  try {
    await createKey(page, name)
    await page.getByLabel("I've stored this key in a safe place").check()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText(name)).toBeVisible()

    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('button', { name: 'Revoke key' }).click()

    // Dismissing leaves the key active.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Revoke this key?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep key' }).click()
    await expect(page.getByText('revoked')).toHaveCount(0)

    // Confirming revokes it, and the row stays listed as revoked.
    await page.getByRole('button', { name: `Actions for ${name}` }).click()
    await page.getByRole('button', { name: 'Revoke key' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke key' }).click()
    await expect(row(page, name).getByText('revoked')).toBeVisible()

    // Survives a reload — the revocation was persisted, not just optimistic.
    await page.reload()
    await expect(row(page, name).getByText('revoked')).toBeVisible()
  } finally {
    await cleanUp(page, name)
  }
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
