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
const fromMock = jest.fn(() => ({ select: profileSelect }))

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
