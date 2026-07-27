import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Logs in once and persists the Supabase session to disk. Every other project
 * loads it via `storageState`, so specs start authenticated without repeating
 * the login flow (and without holding credentials anywhere but the env).
 *
 * Set E2E_EMAIL / E2E_PASSWORD for a dedicated test account. Never point these
 * at a real clinician account: the specs create and revoke API keys.
 */
const STATE = path.join(__dirname, '.auth', 'user.json')

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  setup.skip(
    !email || !password,
    'E2E_EMAIL / E2E_PASSWORD not set — skipping authenticated e2e specs.',
  )

  await page.goto('/auth/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Sign In' }).click()

  // Landing anywhere authenticated is enough; the app routes post-login to
  // /protected/preAuth, which then redirects into the agents shell.
  await page.waitForURL((url) => !url.pathname.startsWith('/auth/'), { timeout: 30_000 })

  fs.mkdirSync(path.dirname(STATE), { recursive: true })
  await page.context().storageState({ path: STATE })

  // Prove the session is actually usable before other specs depend on it.
  await page.goto('/agents/api-keys')
  await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
})
