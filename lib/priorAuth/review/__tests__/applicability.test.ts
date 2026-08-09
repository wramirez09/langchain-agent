import type { PartialPriorAuthArtifact } from '../../artifactSchema'
import { codeApplicabilityCheck } from '../checks/applicability'
import { buildEvidenceIndex, EMPTY_EVIDENCE, type EvidenceIndex } from '../evidence'
import type { ReviewContext } from '../registry'
import type { ReviewIssue } from '../types'
import { commercialMatch, commercialOutput, makeArtifact } from '../../__fixtures__/artifact'

/** Mirrors the registry: honour skipReason, then run. */
function run(
  artifact: PartialPriorAuthArtifact,
  evidence: EvidenceIndex = EMPTY_EVIDENCE,
): { issues: ReviewIssue[]; skipped?: string } {
  const ctx: ReviewContext = { artifact, evidence, repairs: [] }
  const skipped = codeApplicabilityCheck.skipReason?.(ctx)
  if (skipped) return { issues: [], skipped }
  return { issues: codeApplicabilityCheck.run(ctx) as ReviewIssue[] }
}

/**
 * The measured case: a plainly primary C2-C3 / C4-C5 laminectomy where the
 * agent listed 63040/63043 alongside the correct 63045/63048. Both revision
 * codes are in the cervical laminectomy policy and both are in scope, so
 * grounding passes them — correctly. Only applicability can object.
 */
const laminectomy = (
  cpt: { code: string; label: string }[],
  over: Partial<NonNullable<PartialPriorAuthArtifact['requestOverview']>> = {},
): PartialPriorAuthArtifact => {
  const a = makeArtifact()
  a.requestOverview = {
    ...a.requestOverview,
    treatment: 'C2 to C3 and C4 to C5 laminectomy',
    diagnosis: 'Neck pain',
    medicalHistory: 'Neck pain without documented neurologic deficit.',
    cpt: [],
    icd10: [],
    suggestedCpt: [],
    suggestedIcd10: [],
    ...over,
  }
  a.relevantCodes = { cpt, icd10: [] }
  return a
}

const PRIMARY = {
  code: '63045',
  label:
    'Laminectomy, facetectomy and foraminotomy, single vertebral segment; cervical',
}
const REVISION = {
  code: '63040',
  label:
    'Laminotomy, hemilaminectomy, with decompression of nerve root, reexploration, single interspace; cervical; repeat posterior cervical decompression',
}

describe('code applicability — revision codes on a primary request', () => {
  it('flags a reexploration code when nothing says this is a reoperation', () => {
    const { issues } = run(laminectomy([PRIMARY, REVISION]))

    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('code-revision-not-requested')
    expect(issues[0].meta?.code).toBe('63040')
    expect(issues[0].path).toBe('relevantCodes.cpt[1].code')
    expect(issues[0].severity).toBe('warning')
  })

  it('leaves the primary codes alone', () => {
    const { issues } = run(laminectomy([PRIMARY]))
    expect(issues).toEqual([])
  })

  it('checks the Likely-options list too', () => {
    const a = laminectomy([PRIMARY])
    a.requestOverview!.suggestedCpt = [PRIMARY, REVISION]
    const { issues } = run(a)

    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('requestOverview.suggestedCpt[1].code')
  })

  it('never judges the user’s own request codes', () => {
    const a = laminectomy([PRIMARY])
    a.requestOverview!.cpt = [REVISION]
    expect(run(a).issues).toEqual([])
  })

  it('ignores ICD-10 entirely — a diagnosis does not describe an approach', () => {
    const a = laminectomy([PRIMARY])
    a.relevantCodes!.icd10 = [
      { code: 'Z98.890', label: 'Other specified postprocedural states, revision' },
    ]
    expect(run(a).issues).toEqual([])
  })
})

describe('code applicability — when the request IS a revision', () => {
  const cases: [string, string][] = [
    ['treatment names it', 'Revision C4-C5 cervical laminectomy'],
    ['reexploration wording', 'Reexploration of prior cervical decompression'],
    ['redo wording', 'Redo posterior cervical decompression'],
  ]

  it.each(cases)('stays silent when the %s', (_name, treatment) => {
    const { issues } = run(laminectomy([PRIMARY, REVISION], { treatment }))
    expect(issues).toEqual([])
  })

  it('stays silent when the history records a prior operation', () => {
    const { issues } = run(
      laminectomy([PRIMARY, REVISION], {
        medicalHistory: 'Recurrent symptoms following prior laminectomy in 2024.',
      }),
    )
    expect(issues).toEqual([])
  })
})

describe('code applicability — guards', () => {
  it('skips when the request is not described at all', () => {
    const a = makeArtifact()
    a.requestOverview = {
      treatment: '',
      diagnosis: '',
      medicalHistory: '',
      cpt: [],
      icd10: [],
    }
    a.relevantCodes = { cpt: [REVISION], icd10: [] }

    const { issues, skipped } = run(a)
    expect(skipped).toBe('request-not-described')
    expect(issues).toEqual([])
  })

  it('falls back to the guideline’s descriptor when the report prints a bare code', () => {
    // The agent emitted no label, so the only wording available is retrieval's.
    const evidence = buildEvidenceIndex([
      commercialOutput([
        commercialMatch({
          title: 'Cervical Laminectomy',
          procedures: ['cervical laminectomy'],
          cptCodes: ['63040 — Laminotomy, reexploration, single interspace; cervical'],
          icd10Codes: [],
        }),
      ]),
    ])
    const { issues } = run(laminectomy([{ code: '63040', label: '' }]), evidence)

    expect(issues).toHaveLength(1)
    expect(issues[0].meta?.code).toBe('63040')
  })

  it('says nothing about a bare code no source describes', () => {
    const { issues } = run(laminectomy([{ code: '63040', label: '' }]))
    expect(issues).toEqual([])
  })
})
