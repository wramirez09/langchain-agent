import { buildEvidenceIndex, MAX_EVIDENCE_CHARS } from '../evidence'
import {
  commercialMatch,
  commercialOutput,
  makeToolMessage,
  medicareDetail,
} from '../../__fixtures__/artifact'

describe('buildEvidenceIndex — commercial search', () => {
  it('indexes codes from topMatches', () => {
    const ev = buildEvidenceIndex([commercialOutput([commercialMatch()])])
    expect(ev.usable).toBe(true)
    expect(ev.byCode.get('73721')?.[0].kind).toBe('cpt')
    expect(ev.byCode.get('M25.561')?.[0].kind).toBe('icd10')
    expect(ev.cptCount).toBe(1)
    expect(ev.icd10Count).toBe(1)
  })

  // extractRetrievedCodes deliberately ignores relatedMatches (it wants one
  // document). Grounding must not, or a legitimately-sourced code reads as
  // invented.
  it('indexes codes from relatedMatches too', () => {
    const ev = buildEvidenceIndex([
      commercialOutput(
        [commercialMatch({ id: 'top', cptCodes: ['73721 — MRI knee'] })],
        [commercialMatch({ id: 'rel', cptCodes: ['29881 — Knee arthroscopy'] })],
      ),
    ])
    expect(ev.byCode.has('29881')).toBe(true)
    expect(ev.sources.get('cgs:rel')?.rank).toBe('related')
    expect(ev.sources.get('cgs:top')?.rank).toBe('top')
  })

  it('splits "CODE — label" and tolerates a bare code', () => {
    const ev = buildEvidenceIndex([
      commercialOutput([
        commercialMatch({ cptCodes: ['73721 — MRI lower extremity', '73722'] }),
      ]),
    ])
    expect(ev.byCode.get('73721')?.[0].label).toBe('MRI lower extremity')
    expect(ev.byCode.get('73722')?.[0].label).toBe('')
  })

  // The search tool maps a missing `procedures` column to [], so an empty list
  // means "not told", never "covers nothing".
  it('marks procedures unknown when the list is empty', () => {
    const known = buildEvidenceIndex([
      commercialOutput([commercialMatch({ procedures: ['MRI Knee'] })]),
    ])
    const unknown = buildEvidenceIndex([
      commercialOutput([commercialMatch({ procedures: [] })]),
    ])
    expect([...known.sources.values()][0].proceduresKnown).toBe(true)
    expect([...unknown.sources.values()][0].proceduresKnown).toBe(false)
  })
})

describe('buildEvidenceIndex — Medicare shapes', () => {
  it('indexes object-shaped codes', () => {
    const ev = buildEvidenceIndex([medicareDetail()])
    expect(ev.byCode.get('73721')?.[0].label).toBe('MRI knee')
    expect(ev.byCode.get('73721')?.[0].supports).toBe('yes')
    expect(ev.hasMedicareSource).toBe(true)
  })

  // LCD arrays merge supported and excluded codes; `context` is the only
  // discriminator.
  it('reads non-covered context as supports:"no"', () => {
    const ev = buildEvidenceIndex([
      medicareDetail({
        icd10Codes: [
          {
            code: 'M17.11',
            description: 'Osteoarthritis',
            context: 'does not support medical necessity',
          },
        ],
      }),
    ])
    expect(ev.byCode.get('M17.11')?.[0].supports).toBe('no')
  })

  it('parses a single-URL policy_content_extractor payload', () => {
    const ev = buildEvidenceIndex([
      makeToolMessage('policy_content_extractor', {
        policyUrl: 'https://payer.example/policy',
        cptCodes: [{ code: '73721', description: 'MRI knee', context: 'covered' }],
        icd10Codes: [],
      }),
    ])
    expect(ev.byCode.has('73721')).toBe(true)
    expect(ev.sources.has('pce:https://payer.example/policy')).toBe(true)
  })

  // Multi-URL returns a JSON array of JSON *strings* — a second parse per item.
  it('parses the multi-URL array-of-JSON-strings payload', () => {
    const one = JSON.stringify({
      policyUrl: 'https://a.example',
      cptCodes: [{ code: '11111', description: 'A', context: 'covered' }],
      icd10Codes: [],
    })
    const two = JSON.stringify({
      policyUrl: 'https://b.example',
      cptCodes: [{ code: '22222', description: 'B', context: 'covered' }],
      icd10Codes: [],
    })
    const ev = buildEvidenceIndex([
      makeToolMessage('policy_content_extractor', JSON.stringify([one, two])),
    ])
    expect(ev.byCode.has('11111')).toBe(true)
    expect(ev.byCode.has('22222')).toBe(true)
    expect(ev.sources.size).toBe(2)
  })

  // A failed fetch must not count as "we looked and it was not there".
  it('routes an error element to parseFailures, not to sources', () => {
    const ok = JSON.stringify({ policyUrl: 'https://a.example', cptCodes: [], icd10Codes: [] })
    const bad = JSON.stringify({ error: 'timeout', policyUrl: 'https://b.example' })
    const ev = buildEvidenceIndex([
      makeToolMessage('policy_content_extractor', JSON.stringify([ok, bad])),
    ])
    expect(ev.sources.size).toBe(1)
    expect(ev.parseFailures).toEqual([
      { tool: 'policy_content_extractor', reason: 'timeout' },
    ])
  })

  it('records medicare_multi_search documents but no codes', () => {
    const section = (id: string) => ({ query: {}, topMatches: [{ id, title: id }] })
    const ev = buildEvidenceIndex([
      makeToolMessage('medicare_multi_search', {
        ncd: section('N1'),
        lcd: section('L1'),
        lca: section('A1'),
      }),
    ])
    expect(ev.sources.size).toBe(3)
    expect(ev.byCode.size).toBe(0)
    expect(ev.hasMedicareSource).toBe(true)
    expect(ev.usable).toBe(true)
  })

  it('records plain Medicare search tools as sources', () => {
    const ev = buildEvidenceIndex([
      makeToolMessage('ncd_coverage_search', {
        query: {},
        topMatches: [{ id: 'N1', title: 'NCD 220.2' }],
      }),
    ])
    expect(ev.sources.size).toBe(1)
    expect(ev.cptCount).toBe(0)
  })
})

describe('buildEvidenceIndex — robustness', () => {
  // Free web text is not something a code can be attributed to; counting it
  // would make `usable` true without adding anything checkable.
  it('ignores unrecognized tools entirely', () => {
    const ev = buildEvidenceIndex([makeToolMessage('search', 'some web result text')])
    expect(ev.usable).toBe(false)
    expect(ev.sources.size).toBe(0)
    expect(ev.parseFailures).toHaveLength(0)
  })

  it('records a parse failure for malformed output from a known tool', () => {
    const ev = buildEvidenceIndex([
      { name: 'commercial_guidelines_search', content: '{not json' },
    ])
    expect(ev.parseFailures).toEqual([
      { tool: 'commercial_guidelines_search', reason: 'unparseable JSON' },
    ])
    expect(ev.usable).toBe(false)
  })

  it('does not throw on empty or malformed input', () => {
    expect(() => buildEvidenceIndex([])).not.toThrow()
    expect(buildEvidenceIndex([]).usable).toBe(false)
  })

  it('sets truncated when output exceeds the budget', () => {
    const huge = 'x'.repeat(MAX_EVIDENCE_CHARS + 1)
    const ev = buildEvidenceIndex([
      { name: 'commercial_guidelines_search', content: huge },
    ])
    expect(ev.truncated).toBe(true)
  })
})
