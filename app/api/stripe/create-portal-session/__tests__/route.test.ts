/**
 * @jest-environment node
 */

const sessionsCreate = jest.fn()
jest.mock('@/lib/stripe', () => ({
  getStripe: () => ({ billingPortal: { sessions: { create: sessionsCreate } } }),
}))

import { POST } from '../route'

function makeReq(body: any) {
  return { json: async () => body } as unknown as Request
}

describe('create-portal-session POST', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site'
  })

  it('returns billing portal url for given customer', async () => {
    sessionsCreate.mockResolvedValue({ url: 'https://portal/abc' })
    const r = await POST(makeReq({ customerId: 'cus_1' }))
    expect(await r.json()).toEqual({ url: 'https://portal/abc' })
    expect(sessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://site',
    })
  })
})
