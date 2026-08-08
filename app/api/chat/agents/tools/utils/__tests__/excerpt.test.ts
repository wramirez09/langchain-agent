import { queryTerms, selectRelevantExcerpt } from '../excerpt'

describe('queryTerms', () => {
  it('drops stopwords, short tokens, and duplicates', () => {
    expect(queryTerms('the C2-C5 laminectomy for neck pain, prior authorization')).toEqual([
      'c2-c5',
      'laminectomy',
      'neck',
      'pain',
    ])
  })

  it('keeps the dot in codes so an ICD-10 in the query still matches', () => {
    expect(queryTerms('M54.12 radiculopathy')).toEqual(['m54.12', 'radiculopathy'])
  })
})

describe('selectRelevantExcerpt', () => {
  const para = (label: string, filler = 'lorem ipsum dolor sit amet consectetur. ') =>
    `${label} ${filler.repeat(8)}`

  it('returns the body untouched when it already fits', () => {
    const body = 'Short guideline body.'
    expect(selectRelevantExcerpt(body, 'anything', 1000)).toBe(body)
  })

  // The regression this module exists for: the criteria carrying the payer's
  // thresholds sit deep in the document, and a fixed head window never reached
  // them.
  it('reaches criteria buried past a fixed head window', () => {
    const body = [
      para('DEFINITIONS. This document describes spine procedures generally.'),
      para('GENERAL DOCUMENTATION REQUIREMENTS. A clear plan of care is expected.'),
      para('BILLING NOTES. Submit with the operative report.'),
      para(
        'CERVICAL LAMINECTOMY CRITERIA. Failure of conservative treatment for at least 6 weeks within the last 6 months.',
      ),
    ].join('\n\n')

    const out = selectRelevantExcerpt(body, 'cervical laminectomy conservative treatment', 900)

    expect(out).toContain('at least 6 weeks within the last 6 months')
    expect(out.length).toBeLessThanOrEqual(900)
  })

  it('keeps the document opening for context', () => {
    const body = [
      para('OPENING. Cervical laminectomy is a decompression procedure.'),
      para('UNRELATED. Hip arthroplasty component selection.'),
      para('CRITERIA. Imaging must confirm compression at the operative level.'),
    ].join('\n\n')

    const out = selectRelevantExcerpt(body, 'imaging compression operative level', 900)

    expect(out).toContain('OPENING.')
    expect(out).toContain('CRITERIA.')
  })

  it('marks gaps so the agent can tell the text is not contiguous', () => {
    const body = [
      para('OPENING. Cervical decompression overview.'),
      para('UNRELATED. Sleep study scoring rules.'),
      para('CRITERIA. Radiculopathy with objective neurologic deficit.'),
    ].join('\n\n')

    const out = selectRelevantExcerpt(body, 'radiculopathy neurologic deficit', 1000)

    expect(out).toContain('[…]')
    expect(out).not.toContain('Sleep study scoring')
  })

  it('never exceeds the budget, even when every block matches', () => {
    const body = Array.from({ length: 20 }, (_, i) =>
      para(`BLOCK ${i}. laminectomy criteria repeated.`),
    ).join('\n\n')

    const out = selectRelevantExcerpt(body, 'laminectomy criteria', 1200)

    expect(out.length).toBeLessThanOrEqual(1200)
  })

  // Several corpus documents came through a PDF converter and have no blank
  // lines at all; relevance selection has to work inside one long run.
  it('finds criteria inside a document with no paragraph breaks', () => {
    const body =
      'OVERVIEW of decompression. ' +
      'unrelated coding and billing narrative. '.repeat(300) +
      'Failure of conservative treatment for at least 6 weeks within the last 6 months.'

    const out = selectRelevantExcerpt(body, 'conservative treatment failure', 6000)

    expect(out).toContain('at least 6 weeks within the last 6 months')
    expect(out.length).toBeLessThanOrEqual(6000)
  })

  it('falls back to a head slice when the first block alone exceeds the budget', () => {
    const body = 'a'.repeat(5000)

    const out = selectRelevantExcerpt(body, 'anything', 400)

    expect(out).toHaveLength(401) // 400 chars + the ellipsis
    expect(out.endsWith('…')).toBe(true)
  })

  it('handles an empty body and a zero budget without throwing', () => {
    expect(selectRelevantExcerpt('', 'q', 100)).toBe('')
    expect(selectRelevantExcerpt('body', 'q', 0)).toBe('')
  })
})
