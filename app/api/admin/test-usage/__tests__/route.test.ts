/**
 * @jest-environment node
 */

const cookieGet = jest.fn()
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ get: (...a: any[]) => cookieGet(...a) }),
}))

const subsList = jest.fn()
const meterEventsCreate = jest.fn()
jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    subscriptions: { list: subsList },
    billing: { meterEvents: { create: meterEventsCreate } },
  })),
}))

const insertUsageLog = jest.fn()
jest.mock('@/lib/db/repositories/usage.repo', () => ({
  insertUsageLog: (...a: any[]) => insertUsageLog(...a),
}))

import { POST, GET } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as any
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_LIVE_SECRET_KEY = 'sk_live'
  process.env.STRIPE_METER_EVENT_NAME = 'preauthmeter'
})

describe('admin test-usage POST', () => {
  it('returns 401 when not admin', async () => {
    cookieGet.mockReturnValue(undefined)
    const r = await POST(makeReq({ customerId: 'cus' }))
    expect(r.status).toBe(401)
  })

  it('returns 400 when customerId missing', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    const r = await POST(makeReq({}))
    expect(r.status).toBe(400)
  })

  it('returns 404 when no active subscription', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    subsList.mockResolvedValue({ data: [] })
    const r = await POST(makeReq({ customerId: 'cus' }))
    expect(r.status).toBe(404)
  })

  it('returns 404 when no metered item present', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    subsList.mockResolvedValue({
      data: [
        {
          id: 'sub',
          status: 'active',
          customer: 'cus',
          items: {
            data: [{ id: 'si', price: { id: 'p', recurring: { usage_type: 'licensed' } } }],
          },
        },
      ],
    })
    const r = await POST(makeReq({ customerId: 'cus' }))
    expect(r.status).toBe(404)
  })

  it('reports usage and logs to db when userId present', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    subsList.mockResolvedValue({
      data: [
        {
          id: 'sub',
          status: 'active',
          customer: 'cus',
          items: {
            data: [
              {
                id: 'si_met',
                price: { id: 'p', recurring: { usage_type: 'metered' } },
              },
            ],
          },
        },
      ],
    })
    meterEventsCreate.mockResolvedValue({
      event_name: 'preauthmeter',
      identifier: 'evt_1',
      payload: { value: '5' },
    })
    insertUsageLog.mockResolvedValue(undefined)

    const r = await POST(
      makeReq({ customerId: 'cus', quantity: 5, userId: 'u1' }),
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.databaseLogged).toBe(true)
    expect(insertUsageLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        quantity: 5,
        stripe_reported: true,
        stripe_usage_id: 'evt_1',
        metered_item_id: 'si_met',
      }),
    )
  })

  it('still succeeds when db log throws', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    subsList.mockResolvedValue({
      data: [
        {
          id: 'sub',
          status: 'active',
          customer: 'cus',
          items: {
            data: [
              {
                id: 'si_met',
                price: { id: 'p', recurring: { usage_type: 'metered' } },
              },
            ],
          },
        },
      ],
    })
    meterEventsCreate.mockResolvedValue({
      event_name: 'preauthmeter',
      identifier: 'evt_2',
      payload: { value: '1' },
    })
    insertUsageLog.mockRejectedValue(new Error('db'))
    const r = await POST(makeReq({ customerId: 'cus', userId: 'u1' }))
    expect(r.status).toBe(200)
    expect((await r.json()).databaseLogged).toBe(false)
  })
})

describe('admin test-usage GET', () => {
  it('returns 401 when not admin', async () => {
    cookieGet.mockReturnValue(undefined)
    const r = await GET({} as any)
    expect(r.status).toBe(401)
  })

  it('filters subscriptions to those with metered items', async () => {
    cookieGet.mockReturnValue({ value: '1' })
    subsList.mockResolvedValue({
      data: [
        {
          id: 'sub_a',
          status: 'active',
          customer: 'cus_a',
          items: {
            data: [{ id: 'si', price: { id: 'p', recurring: { usage_type: 'licensed' } } }],
          },
        },
        {
          id: 'sub_b',
          status: 'active',
          customer: 'cus_b',
          items: {
            data: [
              {
                id: 'si_met',
                price: {
                  id: 'p2',
                  nickname: 'meter',
                  recurring: { usage_type: 'metered' },
                },
              },
            ],
          },
        },
      ],
    })
    const r = await GET({} as any)
    const body = await r.json()
    expect(body.total).toBe(1)
    expect(body.subscriptions[0].subscriptionId).toBe('sub_b')
    expect(body.subscriptions[0].meteredItems[0].priceNickname).toBe('meter')
  })
})
