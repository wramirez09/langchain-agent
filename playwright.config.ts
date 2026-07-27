import { defineConfig, devices } from '@playwright/test'

/**
 * E2E config. Specs live in `e2e/` and drive a real Next server, so they are
 * deliberately outside Jest's reach (jest.config.js ignores `/e2e/`).
 *
 * Auth: `e2e/auth.setup.ts` logs in once with E2E_EMAIL / E2E_PASSWORD and
 * writes a storage state that every other spec reuses — no per-test login.
 * Without those vars the authenticated projects are skipped rather than
 * failing, so `yarn e2e` stays runnable on a fresh checkout.
 */
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'

// With no credentials there is no storage state to load, so don't declare one —
// the specs themselves skip, instead of Playwright erroring on a missing file.
const authed = !!(process.env.E2E_EMAIL && process.env.E2E_PASSWORD)
const storageState = authed ? 'e2e/.auth/user.json' : undefined

export default defineConfig({
  testDir: './e2e',
  // The app is a shared server: parallel workers would mutate the same org's
  // key list and race each other's assertions.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState },
      dependencies: ['setup'],
    },
    // Mobile web is the primary target for layout work, so the responsive
    // behaviour of the keys table is exercised at a phone viewport too.
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], storageState },
      dependencies: ['setup'],
      testMatch: /api-keys\.spec\.ts/,
    },
  ],

  // Reuse a dev server if one is already up; otherwise start one.
  webServer: {
    command: 'yarn dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
