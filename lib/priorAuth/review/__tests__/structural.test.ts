import { priorAuthArtifactSchema } from '../../artifactSchema'
import type { PartialPriorAuthArtifact } from '../../artifactSchema'
import { structuralCompletenessCheck } from '../checks/structural'
import { buildEvidenceIndex, EMPTY_EVIDENCE, type EvidenceIndex } from '../evidence'
import { ALL_MESSAGES } from '../fieldPaths'
import type { ReviewContext } from '../registry'
import type { ReviewIssue } from '../types'
import {
  makeArtifact,
  makeToolMessage,
  medicareDetail,
} from '../../__fixtures__/artifact'

function run(
  artifact: PartialPriorAuthArtifact,
  evidence: EvidenceIndex = EMPTY_EVIDENCE,
): ReviewIssue[] {
  const ctx: ReviewContext = { artifact, evidence, repairs: [] }
  return structuralCompletenessCheck.run(ctx) as ReviewIssue[]
}

const codes = (issues: ReviewIssue[]) => issues.map((i) => i.code)
const at = (issues: ReviewIssue[], path: string) => issues.filter((i) => i.path === path)

describe('structural completeness — clean artifact', () => {
  it('reports nothing for the golden artifact', () => {
    const medicare = buildEvidenceIndex([medicareDetail()])
    expect(run(makeArtifact(), medicare)).toEqual([])
  })
})

describe('structural completeness — the silent-drop case', () => {
  // The whole reason this check exists: [] is schema-valid, renders as
  // nothing, and renumbers every later section.
  it('flags an empty required array that zod accepts', () => {
    const artifact = makeArtifact({ medicalNecessityCriteria: [] })

    expect(priorAuthArtifactSchema.safeParse(artifact).success).toBe(true)

    const issues = run(artifact)
    // Pointed at the artifact field, not at the UI section id.
    expect(at(issues, 'medicalNecessityCriteria').map((i) => i.code)).toEqual([
      'section-empty',
    ])
    expect(at(issues, 'medicalNecessityCriteria')[0].sectionId).toBe('criteria')
    expect(codes(issues)).not.toContain('schema-invalid')
  })

  it('distinguishes a missing section from an empty one', () => {
    const missing = makeArtifact()
    delete (missing as Record<string, unknown>).medicalNecessityCriteria
    expect(
      at(run(missing), 'medicalNecessityCriteria').map((i) => i.code),
    ).toEqual(['section-missing'])

    expect(
      at(run(makeArtifact({ medicalNecessityCriteria: [] })), 'medicalNecessityCriteria')[0]
        .code,
    ).toBe('section-empty')
  })

  // The schema forces an array, so `[]` is the only way the agent can report
  // "none identified" — treating that as a defect would flag correct reports.
  it('accepts an empty limitations or documentation list as an answer', () => {
    const ev = buildEvidenceIndex([medicareDetail()])
    expect(at(run(makeArtifact({ limitations: [] }), ev), 'limitations')).toEqual([])
    expect(
      at(run(makeArtifact({ requiredDocumentation: [] }), ev), 'requiredDocumentation'),
    ).toEqual([])
  })

  // Omitting the field entirely is still a defect: that is the agent skipping
  // the question, not answering it.
  it('still flags limitations when the field is absent altogether', () => {
    const missing = makeArtifact()
    delete (missing as Record<string, unknown>).limitations
    expect(at(run(missing), 'limitations').map((i) => i.code)).toEqual([
      'section-missing',
    ])
  })

  it('reports a deleted section once, with the more useful message', () => {
    const artifact = makeArtifact()
    delete (artifact as Record<string, unknown>).summary
    const issues = run(artifact)
    // Both the section rule and zod see this; the section rule claims it
    // first because "missing from the report" beats "invalid type".
    expect(at(issues, 'summary')).toHaveLength(1)
    expect(at(issues, 'summary')[0].code).toBe('section-missing')
  })
})

describe('structural completeness — schema errors become field pointers', () => {
  it('maps a bad enum to its field label', () => {
    const artifact = makeArtifact()
    artifact.summary = { ...artifact.summary, determination: 'bogus' as never }
    const found = at(run(artifact), 'summary.determination')
    expect(found[0].code).toBe('schema-invalid')
    expect(found[0].label).toBe('Summary → Determination')
    expect(found[0].sectionId).toBe('summary')
  })

  it('builds indexed pointers for nested paths', () => {
    const artifact = makeArtifact()
    artifact.medicalNecessityCriteria = [
      {
        title: 'Conservative therapy',
        status: 'met',
        subCriteria: [{ title: 'PT', status: 'maybe' as never }],
      },
    ]
    const paths = run(artifact).map((i) => i.path)
    expect(paths).toContain('medicalNecessityCriteria[0].subCriteria[0].status')
  })
})

describe('structural completeness — context-dependent rules', () => {
  it('flags missing Medicare policies only when Medicare sources exist', () => {
    const artifact = makeArtifact({ guidelineBasis: 'medicare' })
    delete (artifact as Record<string, unknown>).medicarePolicies

    const withSources = buildEvidenceIndex([medicareDetail()])
    expect(codes(run(artifact, withSources))).toContain('field-required-by-context')

    // Nothing was retrieved, so there is genuinely nothing to report.
    expect(codes(run(artifact, EMPTY_EVIDENCE))).not.toContain(
      'field-required-by-context',
    )
  })

  it('flags Medicare policies present on a commercial basis', () => {
    const artifact = makeArtifact({ guidelineBasis: 'commercial' })
    expect(at(run(artifact), 'medicarePolicies')[0].code).toBe('section-not-applicable')
  })

  it('flags a fallback basis with no fallback notice', () => {
    const artifact = makeArtifact({ guidelineBasis: 'commercial-fallback' })
    delete (artifact as Record<string, unknown>).medicarePolicies
    delete (artifact as Record<string, unknown>).fallbackNotice
    expect(at(run(artifact), 'fallbackNotice')[0].code).toBe('field-required-by-context')
  })

  it('notes a missing rationale when authorization is required', () => {
    const artifact = makeArtifact({ priorAuthRequired: 'YES' })
    delete (artifact as Record<string, unknown>).priorAuthRationale
    const found = at(run(artifact), 'priorAuthRationale')
    expect(found[0].severity).toBe('info')
  })

  it('does not ask for a rationale when no authorization is required', () => {
    const artifact = makeArtifact({ priorAuthRequired: 'NO' })
    delete (artifact as Record<string, unknown>).priorAuthRationale
    expect(at(run(artifact), 'priorAuthRationale')).toHaveLength(0)
  })
})

describe('structural completeness — deliberate silence', () => {
  // The user may legitimately supply no codes; the UI already says
  // "Not provided". Flagging it would be noise on a correct report.
  it('says nothing about empty user-supplied code lists', () => {
    const artifact = makeArtifact()
    artifact.requestOverview = { ...artifact.requestOverview, cpt: [], icd10: [] }
    const paths = run(artifact).map((i) => i.path)
    expect(paths).not.toContain('requestOverview.cpt')
    expect(paths).not.toContain('requestOverview.icd10')
  })

  it('says nothing about an empty missingItems list', () => {
    const artifact = makeArtifact()
    artifact.summary = { ...artifact.summary, missingItems: [] }
    expect(run(artifact, buildEvidenceIndex([medicareDetail()]))).toEqual([])
  })

  it('says nothing when suggested codes carry no provenance note', () => {
    // The backfill attaches its own note when it fills these; a note is not
    // otherwise required.
    const artifact = makeArtifact()
    expect(artifact.requestOverview?.suggestedCpt?.length).toBeGreaterThan(0)
    expect(artifact.requestOverview?.suggestedCodesNote).toBeUndefined()
    expect(
      run(artifact, buildEvidenceIndex([medicareDetail()])).map((i) => i.path),
    ).not.toContain('requestOverview.suggestedCodesNote')
  })
})

describe('structural completeness — unknown fields', () => {
  it('reports an unknown top-level key as info without rejecting it', () => {
    const artifact = makeArtifact({ somethingNew: true } as never)
    const found = at(run(artifact), 'somethingNew')
    expect(found[0].code).toBe('unknown-field')
    expect(found[0].severity).toBe('info')
  })
})

describe('structural completeness — PHI containment', () => {
  // Findings are persisted and embedded in exported PDFs, so a message that
  // echoed clinical narrative would copy PHI into both.
  it('only ever emits catalog messages', () => {
    const artifact = makeArtifact({
      medicalNecessityCriteria: [],
      guidelineBasis: 'commercial',
      summary: { determination: 'bogus' as never } as never,
    })
    artifact.requestOverview = {
      ...artifact.requestOverview,
      medicalHistory: 'Jane Doe, DOB 1970-01-01, MRN 12345',
    }

    const issues = run(artifact, buildEvidenceIndex([makeToolMessage('x', {})]))
    expect(issues.length).toBeGreaterThan(0)
    for (const i of issues) {
      expect(ALL_MESSAGES).toContain(i.message)
      expect(i.message).not.toMatch(/Jane Doe|12345/)
    }
  })
})
