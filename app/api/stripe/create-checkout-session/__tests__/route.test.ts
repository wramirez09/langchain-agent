/**
 * @jest-environment node
 */

const customersList = jest.fn()
const customersCreate = jest.fn()
const sessionsCreate = jest.fn()

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    customers: { list: customersList, create: customersCreate },
    checkout: { sessions: { create: sessionsCreate } },
  })),
}))

import { POST } from '../route'

function makeReq(body: any, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Request
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test'
  process.env.STRIPE_SUBSCRIPTION_PRICE_ID = 'price_sub'
  process.env.STRIPE_METERED_PRICE_ID = 'price_met'
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
  delete process.env.VERCEL_URL
})

describe('create-checkout-session POST', () => {
  it('returns 400 when input fails validation', async () => {
    const r = await POST(makeReq({ email: 'bad', name: '' }))
    expect(r.status).toBe(400)
  })

  it('reuses existing customer and returns session url', async () => {
    customersList.mockResolvedValue({ data: [{ id: 'cus_1' }] })
    sessionsCreate.mockResolvedValue({ url: 'https://checkout/x' })
    const r = await POST(makeReq({ email: 'a@b.com', name: 'A' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ url: 'https://checkout/x' })
    expect(customersCreate).not.toHaveBeenCalled()
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1', mode: 'subscription' }),
    )
  })

  it('creates new customer with terms metadata when none exists', async () => {
    customersList.mockResolvedValue({ data: [] })
    customersCreate.mockResolvedValue({ id: 'cus_new' })
    sessionsCreate.mockResolvedValue({ url: 'https://checkout/y' })
    await POST(makeReq({ email: 'a@b.com', name: 'A' }))
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'a@b.com',
        metadata: expect.objectContaining({ terms_accepted: 'true' }),
      }),
    )
  })

  it('uses mobile success URL when client header is mobile', async () => {
    customersList.mockResolvedValue({ data: [{ id: 'cus_1' }] })
    sessionsCreate.mockResolvedValue({ url: 'https://checkout/z' })
    await POST(
      makeReq({ email: 'a@b.com', name: 'A' }, { 'x-client': 'mobile' }),
    )
    const args = sessionsCreate.mock.calls[0][0]
    expect(args.success_url).toMatch(/UpdatePassword\?mobile=true/)
  })

  // Regression: NEXT_PUBLIC_BASE_URL_PROD was stored as "app.notedoctor.ai/",
  // so `https://${it}` + "/auth/..." produced a doubled slash in the URL Stripe
  // redirects the buyer to after paying.
  it('builds redirect URLs with no doubled slash when the origin has a trailing slash', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com/'
    customersList.mockResolvedValue({ data: [{ id: 'cus_1' }] })
    sessionsCreate.mockResolvedValue({ url: 'https://checkout/y' })
    await POST(makeReq({ email: 'a@b.com', name: 'A' }))
    const args = sessionsCreate.mock.calls[0][0]
    expect(args.success_url).toContain('https://example.com/auth/update-password')
    expect(args.success_url).not.toContain('example.com//')
    expect(args.cancel_url).not.toContain('example.com//')
  })

  // Regression: preview deployments run with NODE_ENV=production, so the old
  // ternary sent them to the production origin — a checkout begun on a preview
  // build returned the buyer to the live site with a real session_id.
  it('returns preview deployments to themselves, not to production', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    process.env.VERCEL_URL = 'feat-branch-abc123.vercel.app'
    customersList.mockResolvedValue({ data: [{ id: 'cus_1' }] })
    sessionsCreate.mockResolvedValue({ url: 'https://checkout/p' })
    await POST(makeReq({ email: 'a@b.com', name: 'A' }))
    const args = sessionsCreate.mock.calls[0][0]
    expect(args.success_url).toContain('https://feat-branch-abc123.vercel.app/')
    expect(args.cancel_url).toContain('https://feat-branch-abc123.vercel.app/')
  })

  it('returns 500 when stripe omits checkout url', async () => {
    customersList.mockResolvedValue({ data: [{ id: 'cus_1' }] })
    sessionsCreate.mockResolvedValue({ url: null })
    const r = await POST(makeReq({ email: 'a@b.com', name: 'A' }))
    expect(r.status).toBe(500)
  })
})
