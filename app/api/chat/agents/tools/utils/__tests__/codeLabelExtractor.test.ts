import {
  extractCodeLabels,
  mergeCodeLabels,
  normalizeCode,
} from '../codeLabelExtractor'

describe('normalizeCode', () => {
  it('drops leading +, trailing punctuation, uppercases', () => {
    expect(normalizeCode('+0698T')).toBe('0698T')
    expect(normalizeCode('M48.02-')).toBe('M48.02')
    expect(normalizeCode(' m54.2 ')).toBe('M54.2')
  })
})

describe('extractCodeLabels', () => {
  it('extracts inline "CODE - description" (dash separator)', () => {
    const m = extractCodeLabels('\\- 43236 - EGD with directed submucosal injection')
    expect(m.get('43236')).toBe('EGD with directed submucosal injection')
  })

  it('extracts inline "CODE description" (space separator, from guideline PDFs)', () => {
    const m = extractCodeLabels(
      '63045 Laminectomy, facetectomy and foraminotomy; cervical, single vertebral segment (primary)',
    )
    expect(m.get('63045')).toContain('Laminectomy, facetectomy and foraminotomy')
  })

  it('extracts ICD with trailing dash and parenthetical', () => {
    const m = extractCodeLabels('M54.2 Cervicalgia (neck pain) – often insufficient alone')
    expect(m.get('M54.2')).toContain('Cervicalgia')
    const m2 = extractCodeLabels('M50.1- Cervical disc disorder with radiculopathy')
    expect(m2.get('M50.1')).toBe('Cervical disc disorder with radiculopathy')
  })

  it('applies a group label to every code in a comma list', () => {
    const m = extractCodeLabels('**Breast MRI:** 77046, 77047, 77048, +0698T')
    expect(m.get('77046')).toBe('Breast MRI')
    expect(m.get('77047')).toBe('Breast MRI')
    expect(m.get('0698T')).toBe('Breast MRI')
  })

  it('carries a group label onto a code list that wraps to the next line', () => {
    const m = extractCodeLabels(
      '\\- Posterior decompression without fusion: 63001, 63015, 63020, +63035,\n63040, +63043, 63045, +63048, 63050, 63051',
    )
    expect(m.get('63045')).toBe('Posterior decompression without fusion')
    expect(m.get('63048')).toBe('Posterior decompression without fusion')
  })

  it('does not let a carried label leak past a blank line', () => {
    const m = extractCodeLabels(
      'Posterior decompression without fusion: 63001,\n\n99213, 99214',
    )
    expect(m.get('99213')).toBeUndefined()
  })

  it('does NOT treat a bare code list as a description', () => {
    const m = extractCodeLabels('77011, 77012, 77013, 77014')
    expect(m.size).toBe(0)
  })

  it('ignores years / non-code numbers and prose lines', () => {
    const m = extractCodeLabels('Updated in 2026 for the new policy year.')
    expect(m.size).toBe(0)
  })

  it('keeps the most informative label when a code appears twice', () => {
    const merged = mergeCodeLabels([
      extractCodeLabels('63048 Each additional segment'),
      extractCodeLabels(
        '63048 Each additional segment (add-on to 63045–63047), cervical/thoracic/lumbar',
      ),
    ])
    expect(merged.get('63048')).toContain('add-on')
  })
})
