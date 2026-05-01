import {
  CommercialGuidelineSearchInputSchema,
  inferDomainFromFolder,
  inferTitleFromFilename,
  extractCPTCodes,
  extractICD10Codes,
  extractKeywordsFromFilename,
} from '../commercialGuidelineTypes'

describe('inferDomainFromFolder', () => {
  it('strips the plaintext prefix', () => {
    expect(inferDomainFromFolder('plaintextcardio')).toBe('cardio')
    expect(inferDomainFromFolder('PLAINTEXTGenetic')).toBe('genetic')
  })

  it('returns lowercased name when no prefix', () => {
    expect(inferDomainFromFolder('Oncology')).toBe('oncology')
  })
})

describe('inferTitleFromFilename', () => {
  it('handles hyphenated filenames', () => {
    expect(inferTitleFromFilename('mri-lumbar-spine.md')).toBe('Mri Lumbar Spine')
  })

  it('handles underscore filenames', () => {
    expect(inferTitleFromFilename('mri_lumbar_spine.txt')).toBe('Mri Lumbar Spine')
  })

  it('splits camelCase', () => {
    expect(inferTitleFromFilename('mriLumbarSpine.md')).toBe('Mri Lumbar Spine')
  })
})

describe('extractCPTCodes', () => {
  it('returns empty when no codes present', () => {
    expect(extractCPTCodes('no codes here')).toEqual([])
  })

  it('extracts and de-duplicates 5-digit codes', () => {
    const codes = extractCPTCodes('Use CPT 72148 and CPT: 72148 with code 72149')
    expect(codes.sort()).toEqual(['72148', '72149'])
  })
})

describe('extractICD10Codes', () => {
  it('extracts ICD-10 patterns and uppercases them', () => {
    const codes = extractICD10Codes('see ICD-10: m54.16 also m54.16 and z99.89')
    expect(codes).toContain('M54.16')
    expect(codes).toContain('Z99.89')
    // Deduplicated
    expect(codes.filter((c) => c === 'M54.16')).toHaveLength(1)
  })

  it('returns empty when no codes present', () => {
    expect(extractICD10Codes('no medical codes')).toEqual([])
  })
})

describe('extractKeywordsFromFilename', () => {
  it('returns lowercase deduplicated tokens > 2 chars', () => {
    const kws = extractKeywordsFromFilename('mri-lumbar-spine-mri.md')
    expect(kws).toContain('mri')
    expect(kws).toContain('lumbar')
    expect(kws).toContain('spine')
    // dedup
    expect(kws.filter((k) => k === 'mri')).toHaveLength(1)
  })

  it('filters out very short words', () => {
    const kws = extractKeywordsFromFilename('a-bc-def.md')
    expect(kws).toEqual(['def'])
  })
})

describe('CommercialGuidelineSearchInputSchema', () => {
  it('rejects empty query', () => {
    expect(() => CommercialGuidelineSearchInputSchema.parse({ query: '' })).toThrow()
  })

  it('applies default maxResults of 5', () => {
    const r = CommercialGuidelineSearchInputSchema.parse({ query: 'q' })
    expect(r.maxResults).toBe(5)
  })
})
