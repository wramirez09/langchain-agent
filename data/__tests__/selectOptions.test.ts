import {
  defaultInsuranceProvidersOptions,
  getInsuranceProvidersOptions,
  insuranceProvidersOptions,
} from '../selectOptions'

describe('insurance provider options', () => {
  it('exposes Medicare and Commercial as the available providers', () => {
    expect(insuranceProvidersOptions.map((o) => o.value)).toEqual([
      'Medicare',
      'Commercial',
    ])
  })

  it('every option has a well-formed value/label pair', () => {
    for (const opt of insuranceProvidersOptions) {
      expect(typeof opt.value).toBe('string')
      expect(opt.value.length).toBeGreaterThan(0)
      expect(opt.label).toBe(opt.value)
    }
  })

  it('getInsuranceProvidersOptions returns the default provider set', () => {
    const result = getInsuranceProvidersOptions({
      email: 'someone@example.com',
      isSignedIn: true,
    })
    expect(result).toEqual(defaultInsuranceProvidersOptions)
  })
})
