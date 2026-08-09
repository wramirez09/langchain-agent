/**
 * Is every code in the report actually traceable to something a tool returned?
 *
 * The bias throughout is toward silence. A false "this code was invented" on a
 * correct report costs more trust than a missed defect earns, so the check
 * emits nothing whenever it cannot prove absence:
 *
 *   - no usable evidence at all → say nothing (no evidence ≠ invented)
 *   - evidence was truncated → say nothing (absence is not provable)
 *   - evidence carries no codes of this kind → "could not check", as info
 *
 * The user's own codes in `requestOverview.cpt` / `.icd10` are never checked.
 * They came from the request, not from retrieval, and flagging them as
 * ungrounded would be nonsense.
 */

import {
  contentTokens,
  normalizeCode,
  sourceMatchesRequest,
  MAX_SOURCE_PROCEDURES,
} from '../../backfillCodes'
import type { LabeledCode, PartialPriorAuthArtifact } from '../../artifactSchema'
import { MESSAGES, labelForPointer, sectionIdForPointer } from '../fieldPaths'
import type { EvidenceCodeHit, EvidenceIndex } from '../evidence'
import type { ArtifactCheck, ReviewContext } from '../registry'
import type { ReviewIssue, ReviewIssueCode, ReviewSeverity } from '../types'

const CHECK_ID = 'code-grounding'

interface CodeList {
  path: string
  kind: 'cpt' | 'icd10'
  codes: readonly LabeledCode[]
}

/** The four lists the agent fills from retrieval. Not the user's own codes. */
function checkedLists(artifact: PartialPriorAuthArtifact): CodeList[] {
  const asCodes = (v: unknown): LabeledCode[] =>
    Array.isArray(v) ? (v.filter((c) => c && typeof c === 'object') as LabeledCode[]) : []

  return [
    {
      path: 'relevantCodes.cpt',
      kind: 'cpt',
      codes: asCodes(artifact.relevantCodes?.cpt),
    },
    {
      path: 'relevantCodes.icd10',
      kind: 'icd10',
      codes: asCodes(artifact.relevantCodes?.icd10),
    },
    {
      path: 'requestOverview.suggestedCpt',
      kind: 'cpt',
      codes: asCodes(artifact.requestOverview?.suggestedCpt),
    },
    {
      path: 'requestOverview.suggestedIcd10',
      kind: 'icd10',
      codes: asCodes(artifact.requestOverview?.suggestedIcd10),
    },
  ]
}

function issue(
  code: ReviewIssueCode,
  severity: ReviewSeverity,
  path: string,
  message: string,
  meta?: ReviewIssue['meta'],
): ReviewIssue {
  return {
    code,
    severity,
    checkId: CHECK_ID,
    path,
    sectionId: sectionIdForPointer(path),
    label: labelForPointer(path),
    message,
    meta,
  }
}

/**
 * Can the scoping test run at all?
 *
 * Two preconditions, both of which would otherwise produce mass false
 * positives:
 *
 * 1. The request must tokenize to something. `sourceMatchesRequest` returns
 *    false when the request has no content tokens, so a treatment made only of
 *    stopwords ("Total surgery") would mark every source off-scope and flag
 *    every code in the report.
 * 2. At least one source must actually know its procedure list. Until the
 *    `procedures` column migration is applied the search RPC cannot return one,
 *    so every commercial source reports an empty list and there is nothing to
 *    compare against. Medicare policies never have one by nature.
 */
function scopingSkipReason(
  artifact: PartialPriorAuthArtifact,
  evidence: EvidenceIndex,
): string | undefined {
  const ov = artifact.requestOverview
  const tokens = contentTokens(`${ov?.treatment ?? ''} ${ov?.diagnosis ?? ''}`)
  if (tokens.size === 0) return 'request-has-no-content-tokens'

  for (const s of evidence.sources.values()) {
    if (s.proceduresKnown) return undefined
  }
  return 'source-procedures-unavailable'
}

/**
 * A source is "specific" when its procedure list reads as a synonym set for one
 * procedure rather than a catalogue of many. Same threshold the backfill gate
 * uses, and the same measured basis: on the live corpus a focused document
 * lists 5-8 procedures while the catalogues list 14-30.
 */
function isSpecific(procedures: readonly string[]): boolean {
  return procedures.length > 0 && procedures.length <= MAX_SOURCE_PROCEDURES
}

/**
 * The procedure-specific sources that cover this request AND carry codes of the
 * given kind, keyed by kind.
 *
 * Both conditions matter. A specific source that lists no CPT at all is no
 * evidence that a CPT from a catalogue is wrong — there was no narrower list
 * that could have carried it.
 */
function specificRivals(
  artifact: PartialPriorAuthArtifact,
  evidence: EvidenceIndex,
): { cpt: Set<string>; icd10: Set<string> } {
  const ov = artifact.requestOverview
  const kindsBySource = new Map<string, Set<'cpt' | 'icd10'>>()
  for (const hits of evidence.byCode.values()) {
    for (const h of hits) {
      let kinds = kindsBySource.get(h.sourceId)
      if (!kinds) kindsBySource.set(h.sourceId, (kinds = new Set()))
      kinds.add(h.kind)
    }
  }

  const out = { cpt: new Set<string>(), icd10: new Set<string>() }
  for (const s of evidence.sources.values()) {
    if (!s.proceduresKnown || !isSpecific(s.procedures)) continue
    if (!sourceMatchesRequest(s.title, s.procedures, ov?.treatment, ov?.diagnosis)) {
      continue
    }
    const kinds = kindsBySource.get(s.id)
    if (kinds?.has('cpt')) out.cpt.add(s.id)
    if (kinds?.has('icd10')) out.icd10.add(s.id)
  }
  return out
}

export const codeGroundingCheck: ArtifactCheck = {
  id: CHECK_ID,
  title: 'Code grounding and scoping',

  skipReason(ctx: ReviewContext): string | undefined {
    // No evidence at all is not a defect in the artifact — it is an absence of
    // anything to compare against.
    if (!ctx.evidence.usable) return 'no-usable-evidence'
    if (ctx.evidence.truncated) return 'evidence-truncated'
    return undefined
  },

  // Membership can still be tested when scoping cannot. Reporting `ok` in that
  // state would claim the codes were checked against the request, which is the
  // half that did not run — today it never runs, because the search RPC cannot
  // return `procedures` until the migration lands.
  partialReason(ctx: ReviewContext): string | undefined {
    return scopingSkipReason(ctx.artifact, ctx.evidence)
  },

  run(ctx: ReviewContext): ReviewIssue[] {
    const { artifact, evidence } = ctx
    const out: ReviewIssue[] = []

    const scopingSkip = scopingSkipReason(artifact, evidence)
    const ov = artifact.requestOverview
    // Same precondition as scoping: without procedure lists there is no way to
    // tell a catalogue from a focused policy.
    const rivals = scopingSkip
      ? { cpt: new Set<string>(), icd10: new Set<string>() }
      : specificRivals(artifact, evidence)

    for (const list of checkedLists(artifact)) {
      const kindCount = list.kind === 'cpt' ? evidence.cptCount : evidence.icd10Count

      list.codes.forEach((entry, i) => {
        const code = normalizeCode(entry?.code)
        if (!code) return

        const path = `${list.path}[${i}].code`
        const hits: EvidenceCodeHit[] = (evidence.byCode.get(code) ?? []).filter(
          (h) => h.kind === list.kind,
        )

        if (hits.length === 0) {
          if (kindCount === 0) {
            // The tools that ran carry no codes of this kind, so we have no
            // basis for an opinion either way.
            out.push(
              issue(
                'code-evidence-unavailable',
                'info',
                path,
                MESSAGES.codeEvidenceUnavailable,
                { code },
              ),
            )
            return
          }
          out.push(
            issue('code-not-in-evidence', 'warning', path, MESSAGES.codeNotInEvidence, {
              code,
            }),
          )
          return
        }

        // Grounded only to a policy's non-covered list. Membership alone would
        // greenlight a code the policy names as excluded.
        if (hits.every((h) => h.supports === 'no')) {
          out.push(
            issue(
              'code-cited-as-non-covered',
              'warning',
              path,
              MESSAGES.codeCitedAsNonCovered,
              { code },
            ),
          )
          return
        }

        if (scopingSkip) return

        const inScope = hits.some((h) => {
          const source = evidence.sources.get(h.sourceId)
          if (!source) return true
          if (!source.proceduresKnown) return true
          return sourceMatchesRequest(
            source.title,
            source.procedures,
            ov?.treatment,
            ov?.diagnosis,
          )
        })

        if (!inScope) {
          out.push(
            issue(
              'code-source-out-of-scope',
              'warning',
              path,
              MESSAGES.codeSourceOutOfScope,
              { code },
            ),
          )
          return
        }

        // In scope, but is it in the RIGHT source? A catalogue that covers the
        // requested procedure among a dozen others passes the scope test
        // honestly, so scoping alone cannot catch a code borrowed from it while
        // the procedure's own policy — also retrieved — omits the code.
        const rivalsForKind = list.kind === 'cpt' ? rivals.cpt : rivals.icd10
        if (rivalsForKind.size === 0) return

        const inSpecificSource = hits.some((h) => rivalsForKind.has(h.sourceId))
        if (!inSpecificSource) {
          out.push(
            issue(
              'code-only-in-broader-source',
              'warning',
              path,
              MESSAGES.codeOnlyInBroaderSource,
              { code },
            ),
          )
        }
      })
    }

    return out
  },
}

/** Exposed for the registry so a skipped scoping pass is reportable. */
export { scopingSkipReason }
