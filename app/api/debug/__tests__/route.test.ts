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
    // Even with secrets present, an anonymous caller must learn nothing.
    const oldStripe = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk'
    process.env.STRIPE_FOO = 'x'
    process.env.NEXT_BAR = 'y'

    const r = await GET()
    expect(r.status).toBe(404)
    const raw = await r.text()
    // No enumeration, no presence flags, no variable names of any kind.
    expect(raw).not.toContain('STRIPE')
    expect(raw).not.toContain('NEXT')
    expect(raw).not.toContain('stripeKeyDefined')

    process.env.STRIPE_SECRET_KEY = oldStripe
    delete process.env.STRIPE_FOO
    delete process.env.NEXT_BAR
  })

  it('reports minimal status to an admin session (no enumeration)', async () => {
    adminCookie = '1'
    const old = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk'
    process.env.STRIPE_FOO = 'x'

    const r = await GET()
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.stripeKeyDefined).toBe(true)
    expect(body.stripeKeys).toBeUndefined() // enumeration removed even when authed
    expect(body.nextKeys).toBeUndefined()

    process.env.STRIPE_SECRET_KEY = old
    delete process.env.STRIPE_FOO
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
