import {
  scoreMedicareNCD,
  scoreMedicareLCD,
  scoreMedicareLCA,
} from '../scoreMedicareDocument'

describe('scoreMedicareNCD', () => {
  it('gives +10 for exact display ID match', () => {
    const r = scoreMedicareNCD(
      { document_display_id: 'NCD2203', title: 'MRI' },
      { query: 'ncd2203', maxResults: 10 }
    )
    expect(r.score).toBe(10)
    expect(r.matchedOn[0]).toMatch(/displayId:exact/)
  })

  it('gives +5 for partial display ID match', () => {
    const r = scoreMedicareNCD(
      { document_display_id: 'ncd2203', title: 'MRI' },
      { query: 'see ncd2203 here', maxResults: 10 }
    )
    expect(r.score).toBeGreaterThanOrEqual(5)
    expect(r.matchedOn.some((m) => m.includes('displayId:partial'))).toBe(true)
  })

  it('scores +5 for exact title match', () => {
    const r = scoreMedicareNCD(
      { document_display_id: '999', title: 'cardiac mri' },
      { query: 'cardiac mri', maxResults: 10 }
    )
    expect(r.score).toBeGreaterThanOrEqual(5)
    expect(r.matchedOn).toContain('title:exact')
  })

  it('falls back to token match', () => {
    const r = scoreMedicareNCD(
      { document_display_id: 'xyz', title: 'cardiac procedures and stuff' },
      { query: 'cardiac', maxResults: 10 }
    )
    expect(r.score).toBeGreaterThan(0)
  })

  it('returns zero when nothing matches', () => {
    const r = scoreMedicareNCD(
      { document_display_id: 'aaa', title: 'unrelated topic xyz' },
      { query: 'cardiology', maxResults: 10 }
    )
    expect(r.score).toBe(0)
    expect(r.matchedOn).toEqual([])
  })

  it('handles missing fields safely (does not throw)', () => {
    expect(() =>
      scoreMedicareNCD({}, { query: 'mri', maxResults: 10 })
    ).not.toThrow()
  })
})

describe('scoreMedicareLCD', () => {
  it('adds state bonus when state matches', () => {
    const r = scoreMedicareLCD(
      {
        document_display_id: 'L123',
        title: 'lumbar spine MRI guidelines',
        state_description: 'Illinois',
      },
      { query: 'lumbar spine MRI guidelines', state: 'Illinois', maxResults: 10 }
    )
    expect(r.matchedOn.some((m) => m.startsWith('state:'))).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(5)
  })

  it('exact display ID gets +10', () => {
    const r = scoreMedicareLCD(
      { document_display_id: 'L123', title: '' },
      { query: 'l123', maxResults: 10 }
    )
    expect(r.score).toBe(10)
  })

  it('treatment overlap adds +1', () => {
    const r = scoreMedicareLCD(
      { document_display_id: '', title: 'mri lumbar spine guidelines' },
      {
        query: 'imaging',
        treatment: 'mri lumbar spine',
        maxResults: 10,
      }
    )
    expect(r.matchedOn.some((m) => m.startsWith('treatment:overlap'))).toBe(true)
  })
})

describe('scoreMedicareLCA', () => {
  it('exact title match gets +5', () => {
    const r = scoreMedicareLCA(
      { title: 'cardiac mri' },
      { query: 'cardiac mri', maxResults: 10 }
    )
    expect(r.score).toBeGreaterThanOrEqual(5)
    expect(r.matchedOn).toContain('title:exact')
  })

  it('state match adds bonus', () => {
    const r = scoreMedicareLCA(
      { title: 'cardiac mri', state_description: 'California' },
      { query: 'cardiac mri', state: 'California', maxResults: 10 }
    )
    expect(r.matchedOn.some((m) => m.startsWith('state:'))).toBe(true)
  })

  it('returns zero with no match', () => {
    const r = scoreMedicareLCA(
      { title: 'unrelated' },
      { query: 'something else', maxResults: 10 }
    )
    expect(r.score).toBe(0)
  })
})
