import type { PartialPriorAuthArtifact } from '../../artifactSchema'
import { codeGroundingCheck } from '../checks/grounding'
import { buildEvidenceIndex, EMPTY_EVIDENCE, type EvidenceIndex } from '../evidence'
import type { ReviewContext } from '../registry'
import type { ReviewIssue } from '../types'
import {
  commercialMatch,
  commercialOutput,
  makeArtifact,
  medicareDetail,
} from '../../__fixtures__/artifact'

function ctxFor(
  artifact: PartialPriorAuthArtifact,
  evidence: EvidenceIndex,
): ReviewContext {
  return { artifact, evidence, repairs: [] }
}

/** Mirrors the registry: honour skipReason, then run. */
function run(
  artifact: PartialPriorAuthArtifact,
  evidence: EvidenceIndex,
): { issues: ReviewIssue[]; skipped?: string } {
  const ctx = ctxFor(artifact, evidence)
  const skipped = codeGroundingCheck.skipReason?.(ctx)
  if (skipped) return { issues: [], skipped }
  return { issues: codeGroundingCheck.run(ctx) as ReviewIssue[] }
}

/** Golden artifact carries CPT 73721/2/3 and ICD-10 M25.561/2/9. */
const onlyKneeCpt = () => {
  const a = makeArtifact()
  a.relevantCodes = { cpt: [{ code: '73721', label: 'MRI knee' }], icd10: [] }
  a.requestOverview = { ...a.requestOverview, suggestedCpt: [], suggestedIcd10: [] }
  return a
}

describe('code grounding — the guards that keep it quiet', () => {
  // No evidence is not proof of invention. This is the single most important
  // behaviour in the check.
  it('says nothing when there is no usable evidence', () => {
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '99999', label: 'Invented' }], icd10: [] }
    const { issues, skipped } = run(a, EMPTY_EVIDENCE)
    expect(skipped).toBe('no-usable-evidence')
    expect(issues).toEqual([])
  })

  it('says nothing when evidence was truncated', () => {
    const ev = { ...buildEvidenceIndex([commercialOutput([commercialMatch()])]), truncated: true }
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '99999', label: 'Invented' }], icd10: [] }
    const { issues, skipped } = run(a, ev)
    expect(skipped).toBe('evidence-truncated')
    expect(issues).toEqual([])
  })

  it('never judges the user’s own request codes', () => {
    const a = onlyKneeCpt()
    a.requestOverview = {
      ...a.requestOverview,
      cpt: [{ code: '99999', label: 'User supplied' }],
    }
    const { issues } = run(a, buildEvidenceIndex([commercialOutput([commercialMatch()])]))
    expect(issues.map((i) => i.path)).not.toContain('requestOverview.cpt[0].code')
  })
})

describe('code grounding — attribution', () => {
  const evidence = () =>
    buildEvidenceIndex([
      commercialOutput(
        [commercialMatch({ id: 'top', cptCodes: ['73721 — MRI knee'] })],
        [commercialMatch({ id: 'rel', cptCodes: ['29881 — Knee arthroscopy'] })],
      ),
    ])

  it('accepts a code found in topMatches', () => {
    expect(run(onlyKneeCpt(), evidence()).issues).toEqual([])
  })

  it('accepts a code found only in relatedMatches', () => {
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '29881', label: 'Arthroscopy' }], icd10: [] }
    expect(run(a, evidence()).issues).toEqual([])
  })

  it('flags a code absent from evidence that carries codes of that kind', () => {
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '99999', label: 'Invented' }], icd10: [] }
    const { issues } = run(a, evidence())
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('code-not-in-evidence')
    expect(issues[0].path).toBe('relevantCodes.cpt[0].code')
    expect(issues[0].meta?.code).toBe('99999')
  })

  // Sources exist but none carry ICD-10, so we have no basis for an opinion.
  it('downgrades to "could not check" when no codes of that kind were retrieved', () => {
    const cptOnly = buildEvidenceIndex([
      commercialOutput([commercialMatch({ cptCodes: ['73721 — MRI'], icd10Codes: [] })]),
    ])
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [], icd10: [{ code: 'M99.9', label: 'Something' }] }
    const { issues } = run(a, cptOnly)
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('code-evidence-unavailable')
    expect(issues[0].severity).toBe('info')
  })

  it('matches codes regardless of case, padding, or trailing punctuation', () => {
    const ev = buildEvidenceIndex([
      commercialOutput([
        commercialMatch({ cptCodes: ['73721'], icd10Codes: ['m25.561 — pain'] }),
      ]),
    ])
    const a = onlyKneeCpt()
    a.relevantCodes = {
      cpt: [{ code: ' 73721 ', label: 'x' }],
      icd10: [{ code: 'M25.561.', label: 'y' }],
    }
    expect(run(a, ev).issues).toEqual([])
  })

  it('checks suggested code lists as well as relevant ones', () => {
    const a = onlyKneeCpt()
    a.requestOverview = {
      ...a.requestOverview,
      suggestedCpt: [{ code: '88888', label: 'Invented' }],
    }
    const { issues } = run(a, evidence())
    expect(issues.map((i) => i.path)).toContain('requestOverview.suggestedCpt[0].code')
  })
})

describe('code grounding — non-covered citation', () => {
  it('flags a code grounded only to a policy’s exclusion list', () => {
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
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [], icd10: [{ code: 'M17.11', label: 'Osteoarthritis' }] }
    const { issues } = run(a, ev)
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('code-cited-as-non-covered')
  })

  it('accepts a code that is excluded by one policy but supported by another', () => {
    const ev = buildEvidenceIndex([
      medicareDetail({
        documentId: 'L1',
        icd10Codes: [{ code: 'M17.11', description: 'OA', context: 'does not support' }],
      }),
      medicareDetail({
        documentId: 'L2',
        icd10Codes: [
          { code: 'M17.11', description: 'OA', context: 'supports medical necessity' },
        ],
      }),
    ])
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [], icd10: [{ code: 'M17.11', label: 'OA' }] }
    expect(run(a, ev).issues).toEqual([])
  })
})

describe('code grounding — scoping', () => {
  const offTopic = () =>
    buildEvidenceIndex([
      commercialOutput([
        commercialMatch({
          title: 'Lumbar Fusion',
          procedures: ['Lumbar Spinal Fusion'],
          cptCodes: ['22633 — Lumbar fusion'],
        }),
      ]),
    ])

  it('flags a code sourced only from an unrelated document', () => {
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '22633', label: 'Lumbar fusion' }], icd10: [] }
    const { issues } = run(a, offTopic())
    expect(issues).toHaveLength(1)
    expect(issues[0].code).toBe('code-source-out-of-scope')
  })

  // Until the `procedures` column migration is applied the RPC cannot return
  // one, so every source reports [] and there is nothing to compare against.
  it('is inert while source procedure lists are unavailable', () => {
    const noProcedures = buildEvidenceIndex([
      commercialOutput([
        commercialMatch({
          title: 'Lumbar Fusion',
          procedures: [],
          cptCodes: ['22633 — Lumbar fusion'],
        }),
      ]),
    ])
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '22633', label: 'Lumbar fusion' }], icd10: [] }

    const { issues } = run(a, noProcedures)
    expect(issues).toEqual([])
  })

  // sourceMatchesRequest returns false when the request has no content tokens,
  // which would otherwise mark every source off-scope and flag every code.
  it('is inert when the request tokenizes to nothing', () => {
    const a = onlyKneeCpt()
    a.requestOverview = { ...a.requestOverview, treatment: 'Total surgery', diagnosis: '' }
    a.relevantCodes = { cpt: [{ code: '22633', label: 'Lumbar fusion' }], icd10: [] }

    const { issues } = run(a, offTopic())
    expect(issues).toEqual([])
  })

  it('still grounds codes while scoping is inert', () => {
    const noProcedures = buildEvidenceIndex([
      commercialOutput([commercialMatch({ procedures: [], cptCodes: ['73721 — MRI'] })]),
    ])
    const a = onlyKneeCpt()
    a.relevantCodes = { cpt: [{ code: '99999', label: 'Invented' }], icd10: [] }
    expect(run(a, noProcedures).issues[0].code).toBe('code-not-in-evidence')
  })
})
