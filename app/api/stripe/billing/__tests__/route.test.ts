/**
 * @jest-environment node
 */

const getStripe = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => getStripe(),
}))

const getUser = jest.fn()
const profileSingle = jest.fn()
const profileEq = jest.fn(() => ({ single: profileSingle }))
const profileSelect = jest.fn(() => ({ eq: profileEq }))
const fromMock = jest.fn((..._a: any[]) => ({ select: profileSelect }))

jest.mock('@/app/utils/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: () => getUser() },
    from: (...a: any[]) => fromMock(...a),
  }),
}))

import { POST } from '../route'

const customersRetrieve = jest.fn()
const sessionsCreate = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site'
  getStripe.mockReturnValue({
    customers: { retrieve: customersRetrieve },
    billingPortal: { sessions: { create: sessionsCreate } },
  })
})

describe('stripe billing POST', () => {
  it('returns 500 when stripe is not initialized', async () => {
    getStripe.mockReturnValue(null)
    const r = await POST()
    expect(r.status).toBe(500)
  })

  it('returns 401 when not authenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const r = await POST()
    expect(r.status).toBe(401)
  })

  it('returns 404 when no stripe_customer_id on profile', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    profileSingle.mockResolvedValue({ data: {}, error: null })
    const r = await POST()
    expect(r.status).toBe(404)
  })

  it('returns 404 when stripe customer was deleted', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    profileSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_1' },
      error: null,
    })
    customersRetrieve.mockResolvedValue({ deleted: true })
    const r = await POST()
    expect(r.status).toBe(404)
  })

  // The common cause of a retrieve() 404: one database shared across Stripe
  // environments, so a live-mode customer is invisible to a test key. The
  // message must name that, not tell a paying subscriber to subscribe again.
  it('explains the environment mismatch when the customer is not in this Stripe account', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc'
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    profileSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_live_only' },
      error: null,
    })
    customersRetrieve.mockRejectedValue(new Error("No such customer: 'cus_live_only'"))
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})

    const r = await POST()

    expect(r.status).toBe(404)
    const body = await r.json()
    expect(body.error).toContain('test mode')
    expect(body.error).toContain('cus_live_only')
    expect(body.error).not.toContain('complete your subscription')
    err.mockRestore()
  })

  it('creates billing portal session on happy path', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    profileSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_1' },
      error: null,
    })
    customersRetrieve.mockResolvedValue({ id: 'cus_1', deleted: false })
    sessionsCreate.mockResolvedValue({ id: 'ps_1', url: 'https://portal' })
    const r = await POST()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ url: 'https://portal' })
  })
})
