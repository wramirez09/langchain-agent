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

describe('debug GET (hardened)', () => {
  beforeEach(() => {
    adminCookie = undefined
  })

  it('returns 404 to unauthenticated callers and leaks nothing', async () => {
    const r = await GET()
    expect(r.status).toBe(404)
    const body = await r.json()
    expect(body.stripeKeyDefined).toBeUndefined()
    expect(body.stripeKeys).toBeUndefined() // env-key enumeration removed
  })

  it('reports minimal status to an admin session', async () => {
    adminCookie = '1'
    const old = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk'

    const r = await GET()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.stripeKeyDefined).toBe(true)
    expect(body.stripeKeys).toBeUndefined() // no enumeration even when authed

    process.env.STRIPE_SECRET_KEY = old
  })

  it('reports stripe key absence to an admin session', async () => {
    adminCookie = '1'
    const old = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY

    const r = await GET()
    const body = await r.json()
    expect(body.stripeKeyDefined).toBe(false)

    process.env.STRIPE_SECRET_KEY = old
  })
})
