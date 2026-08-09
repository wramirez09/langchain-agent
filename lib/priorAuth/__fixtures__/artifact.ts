import { ARTIFACT_JSON_EXAMPLE } from '../artifactSchema'
import type { PartialPriorAuthArtifact } from '../artifactSchema'
import type { ToolMessageRecord } from '../backfillCodes'

/**
 * The prompt's canonical artifact — already asserted schema-valid by
 * artifactSchema.test.ts, so it is the natural "correct output" baseline. A
 * Medicare MRI-of-the-knee request carrying CPT 73721/73722/73723 and ICD-10
 * M25.561/562/569.
 */
export function makeArtifact(
  overrides: Partial<PartialPriorAuthArtifact> = {},
): PartialPriorAuthArtifact {
  return { ...JSON.parse(ARTIFACT_JSON_EXAMPLE), ...overrides }
}

export function makeToolMessage(name: string, payload: unknown): ToolMessageRecord {
  return {
    name,
    content: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2),
  }
}

/** A commercial_guidelines_search match, in the tool's post-redaction shape. */
export function commercialMatch(over: {
  id?: string
  title?: string
  score?: number
  procedures?: string[]
  cptCodes?: string[]
  icd10Codes?: string[]
} = {}) {
  return {
    id: over.id ?? 'doc-1',
    title: over.title ?? 'MRI of the Knee',
    score: over.score ?? 0.9,
    domain: 'muscle',
    matchedOn: ['lex:0.40', 'sem:0.50'],
    excerpt: 'Criteria for advanced knee imaging…',
    procedures: over.procedures ?? ['MRI Knee'],
    cptCodes: over.cptCodes ?? ['73721 — MRI lower extremity joint without contrast'],
    icd10Codes: over.icd10Codes ?? ['M25.561 — Pain in right knee'],
  }
}

export function commercialOutput(
  topMatches: unknown[],
  relatedMatches: unknown[] = [],
): ToolMessageRecord {
  return makeToolMessage('commercial_guidelines_search', {
    query: 'mri knee',
    topMatches,
    relatedMatches,
  })
}

/**
 * Evidence that fully grounds the golden artifact — every CPT and ICD-10 code
 * it reports, attributed to an on-topic knee-MRI source. Use this as the
 * "correct run" baseline; a review of the golden artifact against it should be
 * completely silent.
 */
export function goldenEvidence(): ToolMessageRecord[] {
  return [
    commercialOutput([
      commercialMatch({
        title: 'MRI of the Knee',
        procedures: ['MRI Knee'],
        cptCodes: [
          '73721 — MRI lower extremity joint without contrast',
          '73722 — MRI lower extremity joint with contrast',
          '73723 — MRI lower extremity joint without and with contrast',
        ],
        icd10Codes: [
          'M25.561 — Pain in right knee',
          'M25.562 — Pain in left knee',
          'M25.569 — Pain in unspecified knee',
        ],
      }),
    ]),
    medicareDetail(),
  ]
}

/** medicare_policy_detail output: codes are objects, with a `context` string. */
export function medicareDetail(over: {
  documentId?: string
  cptCodes?: { code: string; description: string; context: string }[]
  icd10Codes?: { code: string; description: string; context: string }[]
} = {}): ToolMessageRecord {
  return makeToolMessage('medicare_policy_detail', {
    documentType: 'lcd',
    documentId: over.documentId ?? 'L34567',
    documentVersion: 3,
    priorAuthRequired: 'CONDITIONAL',
    medicalNecessityCriteria: ['Conservative therapy for 4 weeks'],
    cptCodes: over.cptCodes ?? [
      { code: '73721', description: 'MRI knee', context: 'supports medical necessity' },
    ],
    icd10Codes: over.icd10Codes ?? [
      {
        code: 'M25.561',
        description: 'Pain in right knee',
        context: 'supports medical necessity',
      },
    ],
    requiredDocumentation: [],
    limitationsExclusions: [],
    summary: 'LCD for advanced knee imaging',
  })
}
