import { normalizeText, tokenize, sha256Hex } from '../text'

describe('normalizeText', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeText('  Knee-Pain, MRI!!  ')).toBe('knee pain mri')
  })

  it('keeps letters and numbers', () => {
    expect(normalizeText('CPT 73721 / ICD M25.561')).toBe('cpt 73721 icd m25 561')
  })

  it('returns an empty string for punctuation-only input', () => {
    expect(normalizeText('--- !!! ---')).toBe('')
  })
})

describe('tokenize', () => {
  it('drops tokens of 2 or fewer characters', () => {
    expect(tokenize('an MRI of the knee')).toEqual(['mri', 'knee'])
  })

  it('removes stopwords', () => {
    // "for" and "with" are stopwords; "knee"/"pain" survive
    expect(tokenize('knee pain for patients with')).toEqual([
      'knee',
      'pain',
      'patients',
    ])
  })

  it('returns an empty array when nothing survives', () => {
    expect(tokenize('the and for')).toEqual([])
  })
})

describe('sha256Hex', () => {
  it('returns a stable 64-char hex digest', () => {
    const a = sha256Hex('hello')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex('hello')).toBe(a)
  })

  it('produces different digests for different input', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'))
  })
})
