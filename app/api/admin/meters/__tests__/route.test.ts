/**
 * @jest-environment node
 */

const cookieGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: (...a: any[]) => cookieGet(...a) }),
}))

const metersList = jest.fn()
const getStripe = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => getStripe(),
}))

import { GET } from '../route'

beforeEach(() => {
  jest.clearAllMocks()
  getStripe.mockReturnValue({ billing: { meters: { list: metersList } } })
})

describe('admin meters GET', () => {
  it('returns 401 when admin_session missing', async () => {
    cookieGet.mockReturnValue(undefined)
    const r = await GET()
    expect(r.status).toBe(401)
  })

  it('returns 500 when STRIPE_SECRET_KEY missing', async () => {
    getStripe.mockImplementation(() => {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
    })
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
