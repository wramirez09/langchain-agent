jest.mock('@/lib/supabaseAdmin', () => {
  const maybeSingle = jest.fn()
  const eq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq }))
  const insert = jest.fn()
  const from = jest.fn(() => ({ select, insert }))
  return {
    supabaseAdmin: { from },
    __helpers: { from, select, eq, maybeSingle, insert },
  }
})

import {
  insertUsageLog,
  getSubscriptionByUserId,
} from '../usage.repo'

const helpers = (jest.requireMock('@/lib/supabaseAdmin') as any).__helpers

describe('usage.repo', () => {
  beforeEach(() => {
    helpers.from.mockClear()
    helpers.select.mockClear()
    helpers.eq.mockClear()
    helpers.maybeSingle.mockClear()
    helpers.insert.mockClear()
  })

  describe('insertUsageLog', () => {
    it('inserts into usage_logs with default client', async () => {
      helpers.insert.mockResolvedValue({ error: null })
      await insertUsageLog({
        user_id: 'u1',
        usage_type: 'chat',
        quantity: 1,
        stripe_reported: false,
      })
      expect(helpers.from).toHaveBeenCalledWith('usage_logs')
      expect(helpers.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'u1', usage_type: 'chat' }),
      )
    })

    it('uses provided client when given', async () => {
      const insert = jest.fn().mockResolvedValue({ error: null })
      const from = jest.fn(() => ({ insert }))
      const client: any = { from }
      await insertUsageLog(
        {
          user_id: 'u1',
          usage_type: 'chat',
          quantity: 1,
          stripe_reported: true,
        },
        client,
      )
      expect(from).toHaveBeenCalledWith('usage_logs')
      expect(insert).toHaveBeenCalled()
    })
  })

  describe('getSubscriptionByUserId', () => {
    it('returns subscription when found', async () => {
      helpers.maybeSingle.mockResolvedValue({
        data: {
          stripe_customer_id: 'cus',
          stripe_subscription_id: 'sub',
          metered_item_id: 'mi',
        },
        error: null,
      })
      const r = await getSubscriptionByUserId('u1')
      expect(r).toEqual({
        stripe_customer_id: 'cus',
        stripe_subscription_id: 'sub',
        metered_item_id: 'mi',
      })
      expect(helpers.from).toHaveBeenCalledWith('subscriptions')
      expect(helpers.eq).toHaveBeenCalledWith('user_id', 'u1')
    })

    it('returns null when no row', async () => {
      helpers.maybeSingle.mockResolvedValue({ data: null, error: null })
      const r = await getSubscriptionByUserId('u1')
      expect(r).toBeNull()
    })
  })
})
