/**
 * Is every code applicable to the procedure that was actually requested?
 *
 * Grounding answers a different question — where a code came from — and both
 * of its tests pass here honestly. A guideline document lists the whole family
 * of codes around a procedure, so `63040` ("Laminotomy … reexploration") sits
 * in the cervical laminectomy policy next to `63045`, is retrieved with it, and
 * is in scope for the request. Nothing about its provenance is wrong. It is
 * simply the wrong member of the family: the request is a first operation and
 * that code bills a reoperation.
 *
 * Measured on the reproducer, revision codes appeared in 2 of 5 runs of a
 * plainly primary request, correctly labelled as reexploration each time.
 *
 * The test is deliberately narrow. It reads the descriptor the report itself
 * prints, asks whether that descriptor announces a repeat procedure, and stays
 * silent unless the request gives no sign of being one. It does not try to
 * judge clinical appropriateness in general.
 */

import type { LabeledCode, PartialPriorAuthArtifact } from '../../artifactSchema'
import { normalizeCode } from '../../backfillCodes'
import { MESSAGES, labelForPointer, sectionIdForPointer } from '../fieldPaths'
import type { EvidenceIndex } from '../evidence'
import type { ArtifactCheck, ReviewContext } from '../registry'
import type { ReviewIssue } from '../types'

const CHECK_ID = 'code-applicability'

/**
 * Descriptor wording that marks a code as billing a repeat procedure. Matched
 * against the code's own label, which is either the agent's or the guideline's
 * — never invented here.
 */
const REVISION_IN_LABEL =
  /\b(re-?exploration|re-?operation|revision|redo|repeat|previously operated)\b/i

/**
 * Request wording that says this IS a repeat procedure, in which case a
 * revision code is the correct one and the check must say nothing.
 *
 * Kept broad on purpose: a false negative costs a missed flag, while a false
 * positive tells a surgeon their revision code is wrong on a revision.
 */
const REVISION_IN_REQUEST =
  /\b(re-?exploration|re-?operation|revision|redo|repeat|recurrent|failed (back|fusion|surgery)|prior (surgery|operation|decompression|fusion|laminectomy)|previous (surgery|operation|decompression|fusion|laminectomy)|post-?operative|pseudarthrosis|adjacent segment)\b/i

/** CPT-only. Diagnosis codes do not describe an operative approach. */
const CHECKED_LISTS: { path: string; get: (a: PartialPriorAuthArtifact) => unknown }[] = [
  { path: 'relevantCodes.cpt', get: (a) => a.relevantCodes?.cpt },
  { path: 'requestOverview.suggestedCpt', get: (a) => a.requestOverview?.suggestedCpt },
]

function requestText(artifact: PartialPriorAuthArtifact): string {
  const ov = artifact.requestOverview
  return [ov?.treatment, ov?.diagnosis, ov?.medicalHistory].filter(Boolean).join(' ')
}

/**
 * Every descriptor known for a code: the one the report prints, plus the ones
 * retrieval supplied. A report that prints a bare code still gets checked
 * against the guideline's own wording for it.
 */
function descriptorsFor(entry: LabeledCode, evidence: EvidenceIndex): string[] {
  const out: string[] = []
  if (typeof entry?.label === 'string' && entry.label.trim()) out.push(entry.label)
  const code = normalizeCode(entry?.code)
  for (const hit of evidence.byCode.get(code) ?? []) {
    if (hit.kind === 'cpt' && hit.label) out.push(hit.label)
  }
  return out
}

export const codeApplicabilityCheck: ArtifactCheck = {
  id: CHECK_ID,
  title: 'Code applicability to the requested procedure',

  skipReason(ctx: ReviewContext): string | undefined {
    // With no description of the request there is no way to tell a first
    // operation from a reoperation, and assuming "first" would flag every
    // revision code on every genuine revision.
    if (!requestText(ctx.artifact).trim()) return 'request-not-described'
    return undefined
  },

  run(ctx: ReviewContext): ReviewIssue[] {
    const { artifact, evidence } = ctx
    if (REVISION_IN_REQUEST.test(requestText(artifact))) return []

    const out: ReviewIssue[] = []

    for (const list of CHECKED_LISTS) {
      const codes = list.get(artifact)
      if (!Array.isArray(codes)) continue

      codes.forEach((entry: LabeledCode, i: number) => {
        const code = normalizeCode(entry?.code)
        if (!code) return
        if (!descriptorsFor(entry, evidence).some((d) => REVISION_IN_LABEL.test(d))) {
          return
        }

        const path = `${list.path}[${i}].code`
        out.push({
          code: 'code-revision-not-requested',
          severity: 'warning',
          checkId: CHECK_ID,
          path,
          sectionId: sectionIdForPointer(path),
          label: labelForPointer(path),
          message: MESSAGES.codeRevisionNotRequested,
          meta: { code },
        })
      })
    }

    return out
  },
}
