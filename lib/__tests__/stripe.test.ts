jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation((key: string) => ({ key })),
}))

import { reportUsageToStripeServer } from '../reportUsageToStripeServer'

describe('stripe + reportUsageToStripeServer', () => {
  const oldKey = process.env.STRIPE_SECRET_KEY

  afterEach(() => {
    process.env.STRIPE_SECRET_KEY = oldKey
    jest.resetModules()
  })

  it('throws when STRIPE_SECRET_KEY is missing', () => {
    process.env.STRIPE_SECRET_KEY = ''
    jest.isolateModules(() => {
      const { getStripe } = require('../stripe')
      expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY/)
    })
  })

  it('caches stripe instance across calls', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    let stripe: any
    jest.isolateModules(() => {
      const { getStripe } = require('../stripe')
      const a = getStripe()
      const b = getStripe()
      stripe = a
      expect(a).toBe(b)
    })
    expect(stripe).toBeTruthy()
  })

  it('reportUsageToStripeServer calls createUsageRecord', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    const create = jest.fn().mockResolvedValue({ id: 'rec_1' })
    jest.doMock('stripe', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        subscriptionItems: { createUsageRecord: create },
      })),
    }))
    let result: any
    await jest.isolateModulesAsync(async () => {
      const mod = require('../reportUsageToStripeServer')
      result = await mod.reportUsageToStripeServer('si_1', 5)
    })
    expect(result).toEqual({ id: 'rec_1' })
    expect(create).toHaveBeenCalledWith(
      'si_1',
      expect.objectContaining({ quantity: 5, action: 'increment' })
    )
  })
})
