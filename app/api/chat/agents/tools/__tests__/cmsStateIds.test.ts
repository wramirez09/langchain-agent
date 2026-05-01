import { resolveCmsStateId } from '../cmsStateIds'

describe('resolveCmsStateId', () => {
  it('resolves abbreviation', () => {
    expect(resolveCmsStateId('CA')).not.toBeNull()
  })

  it('resolves full name', () => {
    expect(resolveCmsStateId('Alabama')).toBe(2)
  })

  it('returns null for unknown', () => {
    expect(resolveCmsStateId('Atlantis')).toBeNull()
  })

  it('handles whitespace', () => {
    expect(resolveCmsStateId('  Alabama  ')).toBe(2)
  })
})
