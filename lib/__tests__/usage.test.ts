jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
}))
jest.mock('@/lib/db/repositories/usage.repo', () => ({
  getSubscriptionByUserId: jest.fn(),
  insertUsageLog: jest.fn(),
}))

import { reportUsage } from '../usage'
import { getStripe } from '@/lib/stripe'
import {
  getSubscriptionByUserId,
  insertUsageLog,
} from '@/lib/db/repositories/usage.repo'

const mockedGetStripe = getStripe as jest.Mock
const mockedSub = getSubscriptionByUserId as jest.Mock
const mockedLog = insertUsageLog as jest.Mock

describe('reportUsage', () => {
  beforeEach(() => {
    process.env.STRIPE_METER_EVENT_NAME = 'usage_event'
    jest.clearAllMocks()
  })

  it('returns null when no subscription is found', async () => {
    mockedSub.mockResolvedValue(null)
    const r = await reportUsage({ userId: 'u', usageType: 'chat' })
    expect(r).toBeNull()
  })

  it('returns null when subscription has no metered_item_id', async () => {
    mockedSub.mockResolvedValue({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      metered_item_id: null,
    })
    mockedGetStripe.mockReturnValue({})
    const r = await reportUsage({ userId: 'u', usageType: 'chat' })
    expect(r).toBeNull()
  })

  it('returns null when stripe is not initialized', async () => {
    mockedSub.mockResolvedValue({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      metered_item_id: 'mi_1',
    })
    mockedGetStripe.mockReturnValue(null)
    const r = await reportUsage({ userId: 'u', usageType: 'chat' })
    expect(r).toBeNull()
  })

  it('creates a meter event on the happy path', async () => {
    mockedSub.mockResolvedValue({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      metered_item_id: 'mi_1',
    })
    const create = jest.fn().mockResolvedValue({ identifier: 'evt_1' })
    mockedGetStripe.mockReturnValue({ billing: { meterEvents: { create } } })
    mockedLog.mockResolvedValue(undefined)

    const r = await reportUsage({ userId: 'u', usageType: 'chat' })
    expect(r).toEqual({ identifier: 'evt_1' })
    expect(create).toHaveBeenCalled()
    expect(mockedLog).toHaveBeenCalled()
  })

  it('returns null when meter event creation fails after retries', async () => {
    mockedSub.mockResolvedValue({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      metered_item_id: 'mi_1',
    })
    const create = jest.fn().mockRejectedValue(new Error('temporary outage'))
    mockedGetStripe.mockReturnValue({ billing: { meterEvents: { create } } })
    const r = await reportUsage({ userId: 'u', usageType: 'chat' })
    expect(r).toBeNull()
  }, 30000)

  it('still returns event when usage log insert fails', async () => {
    mockedSub.mockResolvedValue({
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      metered_item_id: 'mi_1',
    })
    const create = jest.fn().mockResolvedValue({ identifier: 'evt_2' })
    mockedGetStripe.mockReturnValue({ billing: { meterEvents: { create } } })
    mockedLog.mockRejectedValue(new Error('invalid query'))
    const r = await reportUsage({ userId: 'u', usageType: 'chat' })
    expect(r).toEqual({ identifier: 'evt_2' })
  })
})
