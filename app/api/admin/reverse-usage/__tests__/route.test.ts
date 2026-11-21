/**
 * @jest-environment node
 */

const cookieGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: (...a: any[]) => cookieGet(...a) }),
}))

const adjustmentsCreate = jest.fn()
const getStripe = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => getStripe(),
}))

import { POST } from '../route'
import { createAdminSessionToken } from '@/lib/auth/adminSession'

process.env.ADMIN_EMAIL = 'admin@example.test'
process.env.ADMIN_PASSWORD = 'admin-password'

function makeReq(body: any) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  getStripe.mockReturnValue({
    billing: { meterEventAdjustments: { create: adjustmentsCreate } },
  })
})

describe('admin reverse-usage POST', () => {
  it('returns 401 when not admin', async () => {
    cookieGet.mockReturnValue(undefined)
    const r = await POST(makeReq({}))
    expect(r.status).toBe(401)
  })

  it('returns 401 for a hand-set admin_session=1 cookie', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    const r = await POST(makeReq({ meterName: 'm', eventIdentifier: 'e' }))
    expect(r.status).toBe(401)
  })

  it('returns 400 when meterName or eventIdentifier missing', async () => {
    cookieGet.mockReturnValue({ value: createAdminSessionToken() })
    const r = await POST(makeReq({ meterName: 'm' }))
    expect(r.status).toBe(400)
  })

  it('cancels meter event on happy path', async () => {
    cookieGet.mockReturnValue({ value: createAdminSessionToken() })
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
    cookieGet.mockReturnValue({ value: createAdminSessionToken() })
    adjustmentsCreate.mockRejectedValue(new Error('nope'))
    const r = await POST(makeReq({ meterName: 'm', eventIdentifier: 'e' }))
    expect(r.status).toBe(500)
  })
})
