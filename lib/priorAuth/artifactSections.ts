/**
 * The single definition of the artifact's section list.
 *
 * Both renderers used to carry their own copy of this — nine `add(...)` calls
 * in `components/prior-auth/artifact/PriorAuthArtifact.tsx` and a hand-kept
 * twin in `components/pdf/ArtifactPdfDoc.tsx` — plus a duplicated `has()`
 * helper. They agreed only by convention, and section numbering is *derived*
 * from whichever sections are present, so a single divergence silently
 * renumbers the printed document relative to the screen.
 *
 * Keeping the order, the presence conditions, and the ids here means the web
 * document, the PDF, and the review gate all reason about the same nine
 * sections. Each renderer still owns its own components; this module owns only
 * *which* sections exist and *when* they show.
 */

import type { PartialPriorAuthArtifact } from './artifactSchema'

/**
 * A section renders when its data is non-empty. `[]` and `""` count as empty —
 * that is exactly why an artifact carrying `medicalNecessityCriteria: []`
 * passes schema validation yet vanishes from the page.
 */
export function has(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return v != null && v !== ''
}

export type ArtifactSectionId =
  | 'overview'
  | 'context'
  | 'authorization'
  | 'medicare'
  | 'criteria'
  | 'codes'
  | 'documentation'
  | 'limitations'
  | 'summary'

export interface ArtifactSectionSpec {
  id: ArtifactSectionId
  /** Label for the web table of contents. Card titles live in the renderers. */
  nav: string
  /**
   * Artifact paths owned by this section, most specific first. Used to roll a
   * field-level finding up to the section that displays it.
   */
  pathPrefixes: string[]
  /**
   * `always` — the agent must produce it on every artifact.
   * `conditional` — required only in certain contexts; see the review gate.
   */
  requirement: 'always' | 'conditional'
  present: (d: PartialPriorAuthArtifact) => boolean
}

/** Document order. Numbering is derived from this list filtered by `present`. */
export const ARTIFACT_SECTIONS: readonly ArtifactSectionSpec[] = [
  {
    id: 'overview',
    nav: 'Request Overview',
    pathPrefixes: ['requestOverview'],
    requirement: 'always',
    present: (d) => has(d.requestOverview),
  },
  {
    id: 'context',
    nav: 'Clinical Context',
    pathPrefixes: ['requestOverview.medicalHistory', 'requestOverview.keyFindings'],
    requirement: 'always',
    present: (d) =>
      has(d.requestOverview?.medicalHistory) || has(d.requestOverview?.keyFindings),
  },
  {
    id: 'authorization',
    nav: 'Authorization',
    pathPrefixes: ['priorAuthRequired', 'priorAuthRationale'],
    requirement: 'always',
    present: (d) => has(d.priorAuthRequired),
  },
  {
    id: 'medicare',
    nav: 'Medicare Coverage',
    pathPrefixes: ['medicarePolicies'],
    requirement: 'conditional',
    present: (d) => has(d.medicarePolicies),
  },
  {
    id: 'criteria',
    nav: 'Necessity Criteria',
    pathPrefixes: ['medicalNecessityCriteria'],
    requirement: 'always',
    present: (d) => has(d.medicalNecessityCriteria),
  },
  {
    id: 'codes',
    nav: 'Relevant Codes',
    pathPrefixes: ['relevantCodes'],
    requirement: 'always',
    present: (d) => has(d.relevantCodes),
  },
  {
    id: 'documentation',
    nav: 'Required Docs',
    pathPrefixes: ['requiredDocumentation'],
    requirement: 'always',
    present: (d) => has(d.requiredDocumentation),
  },
  {
    id: 'limitations',
    nav: 'Limitations',
    pathPrefixes: ['limitations'],
    requirement: 'always',
    present: (d) => has(d.limitations),
  },
  {
    id: 'summary',
    nav: 'Summary',
    pathPrefixes: ['summary'],
    requirement: 'always',
    present: (d) => has(d.summary),
  },
]

/** The sections a given artifact will actually render, in document order. */
export function presentSections(
  d: PartialPriorAuthArtifact,
): readonly ArtifactSectionSpec[] {
  return ARTIFACT_SECTIONS.filter((s) => s.present(d))
}

/**
 * Which section displays a given field path.
 *
 * Longest prefix wins, so `requestOverview.keyFindings` resolves to Clinical
 * Context rather than to Request Overview's broader `requestOverview` claim.
 * Indices are ignored: `relevantCodes.cpt[3].code` matches `relevantCodes`.
 */
export function sectionIdForPath(path: string): ArtifactSectionId | undefined {
  const plain = path.replace(/\[\d+\]/g, '')
  let best: { id: ArtifactSectionId; len: number } | undefined

  for (const section of ARTIFACT_SECTIONS) {
    for (const prefix of section.pathPrefixes) {
      const matches = plain === prefix || plain.startsWith(`${prefix}.`)
      if (!matches) continue
      if (!best || prefix.length > best.len) best = { id: section.id, len: prefix.length }
    }
  }

  return best?.id
}
