/**
 * @jest-environment node
 */

const cookieGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: (...a: any[]) => cookieGet(...a) }),
}))

const metersList = jest.fn()
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    billing: { meters: { list: metersList } },
  })),
}))

import { GET } from '../route'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live'
})

describe('admin meters GET', () => {
  it('returns 401 when admin_session missing', async () => {
    cookieGet.mockReturnValue(undefined)
    const r = await GET()
    expect(r.status).toBe(401)
  })

  it('returns 500 when STRIPE_LIVE_SECRET_KEY missing', async () => {
    delete process.env.STRIPE_LIVE_SECRET_KEY
    cookieGet.mockReturnValue({ value: '1' })
    const r = await GET()
    expect(r.status).toBe(500)
  })

  it('lists meters and returns simplified shape', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    metersList.mockResolvedValue({
      data: [
        {
          id: 'mtr_1',
          event_name: 'evt',
          display_name: 'd',
          status: 'active',
          created: 1,
        },
      ],
    })
    const r = await GET()
    const body = await r.json()
    expect(body.total).toBe(1)
    expect(body.meters[0]).toEqual({
      id: 'mtr_1',
      event_name: 'evt',
      display_name: 'd',
      status: 'active',
      created: 1,
    })
  })

  it('returns 500 when Stripe fails', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    metersList.mockRejectedValue(new Error('nope'))
    const r = await GET()
    expect(r.status).toBe(500)
  })
})
