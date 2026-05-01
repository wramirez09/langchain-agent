import {
  scoreCommercialGuideline,
  scoreAndRankDocuments,
} from '../scoreCommercialGuideline'
import type { CommercialGuidelineDoc } from '../commercialGuidelineTypes'

const baseDoc = (overrides: Partial<CommercialGuidelineDoc> = {}): CommercialGuidelineDoc => ({
  id: 'doc-1',
  title: 'MRI Lumbar Spine',
  treatment: 'MRI Lumbar Spine',
  domain: 'spine',
  sourceGroup: 'plaintextspine',
  sourceType: 'commercial-guideline',
  path: '/path/doc1.md',
  fileName: 'mri-lumbar-spine.md',
  body: 'A guideline about MRI lumbar spine for back pain. CPT 72148. ICD-10: M54.16',
  cptCodes: ['72148'],
  icd10Codes: ['M54.16'],
  tags: ['mri', 'lumbar', 'spine'],
  ...overrides,
})

describe('scoreCommercialGuideline', () => {
  it('+10 for exact CPT match', () => {
    const r = scoreCommercialGuideline(baseDoc(), {
      query: 'mri',
      cpt: '72148',
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('cpt:72148')
    expect(r.score).toBeGreaterThanOrEqual(10)
  })

  it('+10 for ICD-10 match (case-insensitive)', () => {
    const r = scoreCommercialGuideline(baseDoc(), {
      query: 'mri',
      icd10: 'm54.16',
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('icd10:M54.16')
  })

  it('+5 for exact treatment match', () => {
    const r = scoreCommercialGuideline(baseDoc(), {
      query: 'mri',
      treatment: 'MRI Lumbar Spine',
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('treatment:exact')
  })

  it('domain match', () => {
    const r = scoreCommercialGuideline(baseDoc(), {
      query: 'mri',
      domain: 'spine',
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('domain:spine')
  })

  it('payer body match', () => {
    const doc = baseDoc({ body: 'Aetna requires prior auth for MRI lumbar spine' })
    const r = scoreCommercialGuideline(doc, {
      query: 'mri',
      payer: 'Aetna',
      maxResults: 5,
    })
    expect(r.matchedOn.some((m) => m.startsWith('payer:'))).toBe(true)
  })

  it('priority high adds +2', () => {
    const r = scoreCommercialGuideline(baseDoc({ priority: 'high' }), {
      query: 'unrelated nonsense',
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('priority:high')
    expect(r.score).toBeGreaterThanOrEqual(2)
  })

  it('priority medium adds +1', () => {
    const r = scoreCommercialGuideline(baseDoc({ priority: 'medium' }), {
      query: 'unrelated',
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('priority:medium')
  })

  it('procedure match adds +8 each', () => {
    const r = scoreCommercialGuideline(
      baseDoc({ procedures: ['lumbar laminectomy'] }),
      { query: 'lumbar', maxResults: 5 }
    )
    expect(r.matchedOn.some((m) => m.startsWith('procedures:'))).toBe(true)
  })

  it('alias match adds points', () => {
    const r = scoreCommercialGuideline(
      baseDoc({ aliases: ['lumbar mri'] }),
      { query: 'lumbar mri', maxResults: 5 }
    )
    expect(r.matchedOn.some((m) => m.startsWith('aliases:'))).toBe(true)
  })

  it('relatedConditions match', () => {
    const r = scoreCommercialGuideline(
      baseDoc({ relatedConditions: ['chronic back pain'] }),
      {
        query: 'q',
        diagnosis: 'chronic back pain',
        maxResults: 5,
      }
    )
    expect(r.matchedOn.some((m) => m.startsWith('relatedConditions:'))).toBe(true)
  })

  it('payerNotes match', () => {
    const r = scoreCommercialGuideline(
      baseDoc({ payerNotes: { Aetna: 'requires PA' } }),
      { query: 'q', payer: 'Aetna', maxResults: 5 }
    )
    expect(r.matchedOn.some((m) => m.startsWith('payerNotes:'))).toBe(true)
  })

  it('specialty match', () => {
    const r = scoreCommercialGuideline(
      baseDoc({ specialty: ['orthopedic'] }),
      { query: 'orthopedic surgery', maxResults: 5 }
    )
    expect(r.matchedOn.some((m) => m.startsWith('specialty:'))).toBe(true)
  })

  it('returns 0 for fully unrelated content', () => {
    const r = scoreCommercialGuideline(
      baseDoc({
        title: 'Z',
        treatment: 'Z',
        body: 'unrelated nonsense xyz',
        cptCodes: [],
        icd10Codes: [],
        tags: [],
      }),
      { query: 'aaaa', maxResults: 5 }
    )
    expect(r.score).toBe(0)
  })

  it('handles array of cpt codes', () => {
    const r = scoreCommercialGuideline(baseDoc(), {
      query: 'mri',
      cpt: ['72148', '72149'],
      maxResults: 5,
    })
    expect(r.matchedOn).toContain('cpt:72148')
  })
})

describe('scoreAndRankDocuments', () => {
  it('returns top and related matches sorted by score', () => {
    const docs = [
      baseDoc({ id: 'a', cptCodes: ['72148'] }),
      baseDoc({ id: 'b', title: 'Unrelated', treatment: 'unrelated', body: 'aaaa', cptCodes: [], icd10Codes: [], tags: [] }),
    ]
    const result = scoreAndRankDocuments(
      docs,
      { query: 'mri', cpt: '72148', maxResults: 1 },
      false
    )
    expect(result.topMatches).toHaveLength(1)
    expect(result.topMatches[0].id).toBe('a')
  })

  it('drops zero-score documents', () => {
    const docs = [
      baseDoc({ id: 'b', title: 'X', treatment: 'X', body: 'X', cptCodes: [], icd10Codes: [], tags: [] }),
    ]
    const result = scoreAndRankDocuments(
      docs,
      { query: 'completely-unrelated', maxResults: 5 },
      false
    )
    expect(result.topMatches).toHaveLength(0)
  })

  it('merges overlapping documents when enabled', () => {
    const docs = [
      baseDoc({ id: 'a', cptCodes: ['72148'] }),
      baseDoc({ id: 'b', cptCodes: ['72148'], title: 'Another MRI Doc', path: '/p/b.md' }),
    ]
    const result = scoreAndRankDocuments(
      docs,
      { query: 'mri', cpt: '72148', maxResults: 5 },
      true
    )
    // After merging, a single merged result should exist
    const hasMerged = result.topMatches.some((m) => m.id.startsWith('merged-'))
    expect(hasMerged).toBe(true)
  })
})
