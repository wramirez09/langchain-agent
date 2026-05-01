jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
}))

import { reportUsageToStripeServer } from '../reportUsageToStripeServer'
import { getStripe } from '@/lib/stripe'

const mockedGetStripe = getStripe as jest.Mock

describe('reportUsageToStripeServer', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a usage record with increment action and current timestamp', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'rec_1' })
    mockedGetStripe.mockReturnValue({
      subscriptionItems: { createUsageRecord: create },
    })
    const before = Math.floor(Date.now() / 1000)
    const r = await reportUsageToStripeServer('si_1', 3)
    const after = Math.floor(Date.now() / 1000)
    expect(r).toEqual({ id: 'rec_1' })
    expect(create).toHaveBeenCalledWith(
      'si_1',
      expect.objectContaining({ quantity: 3, action: 'increment' }),
    )
    const ts = create.mock.calls[0][1].timestamp
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('defaults quantity to 1', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'rec_2' })
    mockedGetStripe.mockReturnValue({
      subscriptionItems: { createUsageRecord: create },
    })
    await reportUsageToStripeServer('si_2')
    expect(create).toHaveBeenCalledWith(
      'si_2',
      expect.objectContaining({ quantity: 1 }),
    )
  })
})
