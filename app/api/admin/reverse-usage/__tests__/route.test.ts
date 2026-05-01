/**
 * @jest-environment node
 */

const cookieGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: (...a: any[]) => cookieGet(...a) }),
}))

const adjustmentsCreate = jest.fn()
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    billing: { meterEventAdjustments: { create: adjustmentsCreate } },
  })),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live'
})

describe('admin reverse-usage POST', () => {
  it('returns 401 when not admin', async () => {
    cookieGet.mockReturnValue(undefined)
    const r = await POST(makeReq({}))
    expect(r.status).toBe(401)
  })

  it('returns 400 when meterName or eventIdentifier missing', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    const r = await POST(makeReq({ meterName: 'm' }))
    expect(r.status).toBe(400)
  })

  it('cancels meter event on happy path', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    adjustmentsCreate.mockResolvedValue({
      status: 'pending',
      event_name: 'm',
      type: 'cancel',
    })
    const r = await POST(makeReq({ meterName: 'm', eventIdentifier: 'evt_1' }))
    expect(r.status).toBe(200)
    expect(adjustmentsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: 'm',
        type: 'cancel',
        cancel: { identifier: 'evt_1' },
      }),
    )
  })

  it('returns 500 on Stripe error', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    adjustmentsCreate.mockRejectedValue(new Error('nope'))
    const r = await POST(makeReq({ meterName: 'm', eventIdentifier: 'e' }))
    expect(r.status).toBe(500)
  })
})
