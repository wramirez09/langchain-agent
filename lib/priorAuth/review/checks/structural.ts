/**
 * Did the agent produce a whole report?
 *
 * Schema validation alone does not answer this. Every array in the artifact
 * schema accepts `[]`, so an artifact whose `medicalNecessityCriteria` came
 * back empty parses cleanly, renders as nothing, and silently renumbers every
 * section after it — the reader sees a report that looks complete and is not.
 * The empty-section test below is the part of this check that catches that.
 *
 * The other half is zod, whose `.error` was previously computed and thrown
 * away at both call sites. Here it becomes findings pointed at named fields.
 */

import { priorAuthArtifactSchema } from '../../artifactSchema'
import { ARTIFACT_SECTIONS, has } from '../../artifactSections'
import {
  MESSAGES,
  labelForPointer,
  messageForZodIssue,
  pointerFromZodPath,
  sectionIdForPointer,
} from '../fieldPaths'
import type { ArtifactCheck, ReviewContext } from '../registry'
import type { ReviewIssue, ReviewIssueCode, ReviewSeverity } from '../types'

const CHECK_ID = 'structural-completeness'

function issue(
  code: ReviewIssueCode,
  severity: ReviewSeverity,
  path: string,
  message: string,
): ReviewIssue {
  return {
    code,
    severity,
    checkId: CHECK_ID,
    path,
    sectionId: sectionIdForPointer(path),
    label: labelForPointer(path),
    message,
  }
}

/**
 * Fields the agent must always produce. Section-level entries come from the
 * shared manifest; these are the leaves inside them that the renderers depend
 * on but that would otherwise only surface as a raw zod path.
 */
const REQUIRED_LEAVES: string[] = [
  'title',
  'guidelineBasis',
  'disclaimer',
  'requestOverview.treatment',
  'requestOverview.medicalHistory',
  'requestOverview.keyFindings',
  'summary.determination',
  'summary.determinationLabel',
  'summary.rationale',
]

function valueAt(root: unknown, path: string): unknown {
  let cur: unknown = root
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

export const structuralCompletenessCheck: ArtifactCheck = {
  id: CHECK_ID,
  title: 'Structural completeness',

  run(ctx: ReviewContext): ReviewIssue[] {
    const { artifact, evidence } = ctx
    const out: ReviewIssue[] = []
    const claimed = new Set<string>()

    const push = (i: ReviewIssue) => {
      if (claimed.has(i.path)) return
      claimed.add(i.path)
      out.push(i)
    }

    // Sections whose emptiness is a legitimate answer rather than a defect.
    // The schema forces an array, so `[]` is the only way for the agent to say
    // "none identified" — and flagging a correct report is the failure mode
    // this check has to avoid hardest.
    const EMPTINESS_IS_AN_ANSWER = new Set(['limitations', 'requiredDocumentation'])

    // --- sections that must always render ---------------------------------
    // Ahead of zod on purpose: for an absent section, "this section is missing
    // from the report" is a more useful sentence than "invalid type", and
    // whichever rule claims a path first owns it. Zod then fills in everything
    // these rules cannot see (wrong enums, wrong types, nested defects).
    for (const section of ARTIFACT_SECTIONS) {
      if (section.requirement !== 'always') continue
      if (section.present(artifact)) continue

      // The section id names the UI section; the first path prefix names the
      // artifact field behind it. They differ ("criteria" vs
      // "medicalNecessityCriteria"), and a finding must point at the field.
      const path = section.pathPrefixes[0]
      const raw = valueAt(artifact, path)

      // Absent is still a defect for these — the agent skipped the field
      // entirely rather than reporting that it found nothing.
      if (raw !== undefined && EMPTINESS_IS_AN_ANSWER.has(path)) continue

      push(
        raw === undefined
          ? issue('section-missing', 'warning', path, MESSAGES.sectionMissing)
          : issue('section-empty', 'warning', path, MESSAGES.sectionEmpty),
      )
    }

    // --- required leaves ---------------------------------------------------
    for (const path of REQUIRED_LEAVES) {
      const raw = valueAt(artifact, path)
      if (has(raw)) continue
      push(
        raw === undefined
          ? issue('section-missing', 'warning', path, MESSAGES.sectionMissing)
          : issue('section-empty', 'warning', path, MESSAGES.sectionEmpty),
      )
    }

    // --- zod fills in everything the rules above cannot see -----------------
    const parsed = priorAuthArtifactSchema.safeParse(artifact)
    if (!parsed.success) {
      for (const zi of parsed.error.issues) {
        const path = pointerFromZodPath(zi.path)
        if (!path) continue
        push(issue('schema-invalid', 'warning', path, messageForZodIssue(zi.code)))
      }
    }

    // --- context-dependent requirements ------------------------------------
    const basis = artifact.guidelineBasis

    if (basis === 'medicare') {
      // Only a finding when retrieval actually produced Medicare documents.
      // The prompt requires this section "when coverage data was retrieved",
      // so with no such sources there is genuinely nothing to report.
      if (!has(artifact.medicarePolicies) && evidence.hasMedicareSource) {
        push(
          issue(
            'field-required-by-context',
            'warning',
            'medicarePolicies',
            MESSAGES.medicarePoliciesMissing,
          ),
        )
      }
    } else if (basis && has(artifact.medicarePolicies)) {
      // Naming Medicare policies on a commercial answer is a confidentiality
      // problem, not just a tidiness one.
      push(
        issue(
          'section-not-applicable',
          'warning',
          'medicarePolicies',
          MESSAGES.sectionNotApplicable,
        ),
      )
    }

    if (basis === 'commercial-fallback' && !has(artifact.fallbackNotice)) {
      push(
        issue(
          'field-required-by-context',
          'warning',
          'fallbackNotice',
          MESSAGES.fallbackNoticeMissing,
        ),
      )
    }

    if (
      has(artifact.priorAuthRequired) &&
      artifact.priorAuthRequired !== 'NO' &&
      !has(artifact.priorAuthRationale)
    ) {
      push(
        issue(
          'field-required-by-context',
          'info',
          'priorAuthRationale',
          MESSAGES.rationaleMissing,
        ),
      )
    }

    // Note: suggested codes deliberately do NOT require an accompanying
    // provenance note. The backfill already attaches one whenever *it* fills
    // those lists; a note is not otherwise required, and demanding one flags
    // every artifact where the agent legitimately suggested codes itself.

    // --- unknown top-level keys --------------------------------------------
    // Reported, never rejected. Adding `.strict()` to the schema would turn a
    // forward-compatible extra field into a hard parse failure on every
    // historical row.
    const known = new Set(Object.keys(priorAuthArtifactSchema.shape))
    for (const key of Object.keys(artifact ?? {})) {
      if (!known.has(key)) {
        push(issue('unknown-field', 'info', key, MESSAGES.unknownField))
      }
    }

    return out
  },
}
