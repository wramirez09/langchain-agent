/**
 * @jest-environment node
 */

import { GET } from '../route'

describe('debug GET', () => {
  it('reports stripe key presence and exposes env keys with prefixes', async () => {
    const oldStripe = process.env.STRIPE_SECRET_KEY
    process.env.STRIPE_SECRET_KEY = 'sk'
    process.env.STRIPE_FOO = 'x'
    process.env.NEXT_BAR = 'y'

    const r = await GET()
    const body = await r.json()
    expect(body.stripeKeyDefined).toBe(true)
    expect(body.stripeKeys).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY', 'STRIPE_FOO']))
    expect(body.nextKeys).toEqual(expect.arrayContaining(['NEXT_BAR']))

    process.env.STRIPE_SECRET_KEY = oldStripe
    delete process.env.STRIPE_FOO
    delete process.env.NEXT_BAR
  })

  it('reports stripe key absence when unset', async () => {
    const old = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    const r = await GET()
    const body = await r.json()
    expect(body.stripeKeyDefined).toBe(false)
    process.env.STRIPE_SECRET_KEY = old
  })
})
