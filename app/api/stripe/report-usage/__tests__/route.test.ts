/**
 * @jest-environment node
 */

const getUserMock = jest.fn()
jest.mock('@/utils/server', () => ({
  createClient: jest.fn().mockResolvedValue({ auth: { getUser: () => getUserMock() } }),
}))

const reportMock = jest.fn()
jest.mock('@/lib/reportUsageToStripeServer', () => ({
  reportUsageToStripeServer: (...a: any[]) => reportMock(...a),
}))

const insertLogMock = jest.fn()
jest.mock('@/lib/db/repositories/usage.repo', () => ({
  insertUsageLog: (...a: any[]) => insertLogMock(...a),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as unknown as Request
}

beforeEach(() => jest.clearAllMocks())

describe('stripe report-usage POST', () => {
  it('returns 400 when unauthenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const r = await POST(makeReq({ subscription_item_id: 'si' }))
    expect(r.status).toBe(400)
  })

  it('returns 400 when subscription_item_id missing', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const r = await POST(makeReq({}))
    expect(r.status).toBe(400)
  })

  it('reports usage and inserts log on success', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    reportMock.mockResolvedValue({ id: 'rec_1' })
    insertLogMock.mockResolvedValue(undefined)
    const r = await POST(
      makeReq({
        subscription_item_id: 'si',
        usage_type: 'chat',
        quantity: 2,
      }),
    )
    expect(r.status).toBe(200)
    expect(reportMock).toHaveBeenCalledWith('si', 2)
    expect(insertLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        subscription_item_id: 'si',
        stripe_reported: true,
        stripe_usage_id: 'rec_1',
      }),
      expect.anything(),
    )
  })

  it('returns 500 on report failure', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    reportMock.mockRejectedValue(new Error('boom'))
    const r = await POST(makeReq({ subscription_item_id: 'si', usage_type: 'chat' }))
    expect(r.status).toBe(500)
  })
})
