/**
 * @jest-environment node
 */

// Mock the cookie store so we can simulate admin vs unauthenticated callers.
let adminCookie: string | undefined
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'admin_session' && adminCookie ? { value: adminCookie } : undefined,
  }),
}))

import { GET } from '../route'

const CONFIG_VARS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_METER_EVENT_NAME',
  'STRIPE_WEBHOOK_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const

describe('debug GET (hardened)', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    adminCookie = undefined
    for (const k of CONFIG_VARS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of CONFIG_VARS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  const setAll = () => {
    for (const k of CONFIG_VARS) process.env[k] = `value-for-${k}`
  }

  it('returns 404 to unauthenticated callers and leaks nothing', async () => {
    setAll()
    const r = await GET()
    expect(r.status).toBe(404)
    const body = await r.json()
    expect(body.checks).toBeUndefined()
    expect(body.publicApiReady).toBeUndefined()
    expect(body.stripeKeys).toBeUndefined() // env-key enumeration removed
  })

  it('reports every dependency as ready when all are configured', async () => {
    adminCookie = '1'
    setAll()

    const r = await GET()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.publicApiReady).toBe(true)
    expect(body.checks).toMatchObject({
      upstashRedis: true,
      stripeMeterEventName: true,
      stripeSecretKey: true,
      stripeWebhookSecret: true,
      supabaseServiceRole: true,
      openaiApiKey: true,
    })
  })

  it('is not ready when Upstash is missing — the silent fail-open case', async () => {
    adminCookie = '1'
    setAll()
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const body = await (await GET()).json()
    expect(body.checks.upstashRedis).toBe(false)
    expect(body.publicApiReady).toBe(false)
  })

  it('is not ready when the meter event name is missing — the silent unbilled case', async () => {
    adminCookie = '1'
    setAll()
    delete process.env.STRIPE_METER_EVENT_NAME

    const body = await (await GET()).json()
    expect(body.checks.stripeMeterEventName).toBe(false)
    expect(body.publicApiReady).toBe(false)
  })

  // The whole point of booleans: an admin session must never become a way to
  // read the secrets themselves.
  it('never emits a secret value, even to an admin', async () => {
    adminCookie = '1'
    setAll()

    const raw = await (await GET()).text()
    for (const k of CONFIG_VARS) {
      expect(raw).not.toContain(`value-for-${k}`)
    }
  })
})
