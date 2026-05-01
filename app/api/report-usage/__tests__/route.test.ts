/**
 * @jest-environment node
 */

const getUserMock = jest.fn()
jest.mock('@/utils/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: { getUser: () => getUserMock() },
  }),
}))

const reportUsage = jest.fn()
jest.mock('@/lib/usage', () => ({
  reportUsage: (...a: any[]) => reportUsage(...a),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as any
}

beforeEach(() => jest.clearAllMocks())

describe('report-usage POST', () => {
  it('returns 401 when not authenticated', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } })
    const r = await POST(makeReq({ usage_type: 'chat' }))
    expect(r.status).toBe(401)
  })

  it('returns 400 when usage_type missing', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const r = await POST(makeReq({}))
    expect(r.status).toBe(400)
  })

  it('returns 404 when no active subscription found', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    reportUsage.mockResolvedValue(null)
    const r = await POST(makeReq({ usage_type: 'chat' }))
    expect(r.status).toBe(404)
  })

  it('returns success when usage reported', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    reportUsage.mockResolvedValue({ identifier: 'evt_1' })
    const r = await POST(makeReq({ usage_type: 'chat', quantity: 2 }))
    expect(r.status).toBe(200)
    expect(reportUsage).toHaveBeenCalledWith({
      userId: 'u1',
      usageType: 'chat',
      quantity: 2,
    })
  })

  it('returns 500 when reportUsage throws', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } })
    reportUsage.mockRejectedValue(new Error('boom'))
    const r = await POST(makeReq({ usage_type: 'chat' }))
    expect(r.status).toBe(500)
  })
})
