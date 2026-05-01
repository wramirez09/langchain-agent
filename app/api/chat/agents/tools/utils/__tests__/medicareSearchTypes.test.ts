import {
  MedicareSearchInputSchema,
  normalizeCodes,
  normalizeInput,
} from '../medicareSearchTypes'

describe('normalizeCodes', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeCodes(undefined)).toEqual([])
  })

  it('wraps a single string in an array', () => {
    expect(normalizeCodes('72148')).toEqual(['72148'])
  })

  it('returns the array unchanged when already an array', () => {
    expect(normalizeCodes(['72148', '72149'])).toEqual(['72148', '72149'])
  })
})

describe('normalizeInput', () => {
  it('applies defaults and normalizes codes', () => {
    const result = normalizeInput({
      query: 'mri lumbar',
      maxResults: 10,
    })
    expect(result).toEqual({
      query: 'mri lumbar',
      treatment: undefined,
      diagnosis: undefined,
      cptCodes: [],
      icd10Codes: [],
      state: undefined,
      maxResults: 10,
    })
  })

  it('coerces single CPT/ICD to arrays and preserves other fields', () => {
    const result = normalizeInput({
      query: 'q',
      treatment: 't',
      diagnosis: 'd',
      cpt: '72148',
      icd10: 'M54.16',
      state: 'Illinois',
      maxResults: 5,
    })
    expect(result.cptCodes).toEqual(['72148'])
    expect(result.icd10Codes).toEqual(['M54.16'])
    expect(result.state).toBe('Illinois')
    expect(result.treatment).toBe('t')
    expect(result.diagnosis).toBe('d')
    expect(result.maxResults).toBe(5)
  })

  it('falls back to default 10 when maxResults is 0/falsy', () => {
    const result = normalizeInput({ query: 'q', maxResults: 0 })
    expect(result.maxResults).toBe(10)
  })
})

describe('MedicareSearchInputSchema', () => {
  it('rejects empty query', () => {
    expect(() => MedicareSearchInputSchema.parse({ query: '' })).toThrow()
  })

  it('parses minimal valid input and applies default maxResults', () => {
    const parsed = MedicareSearchInputSchema.parse({ query: 'cardiac' })
    expect(parsed.query).toBe('cardiac')
    expect(parsed.maxResults).toBe(10)
  })

  it('accepts arrays for cpt/icd10', () => {
    const parsed = MedicareSearchInputSchema.parse({
      query: 'q',
      cpt: ['72148', '72149'],
      icd10: ['M54.16'],
    })
    expect(parsed.cpt).toEqual(['72148', '72149'])
    expect(parsed.icd10).toEqual(['M54.16'])
  })
})
