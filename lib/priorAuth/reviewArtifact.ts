/**
 * The review gate: everything that happens to an artifact between the agent
 * finishing and the client receiving it.
 *
 * Order matters. Deterministic repairs run first, then the checks run against
 * the repaired artifact — so a code the backfill just supplied is judged the
 * same way one the model wrote is, and a finding never describes a state the
 * reader will not see.
 *
 * This is server-side only and async. `parseArtifactText` stays sync and pure
 * because it runs during a React render; nothing here may be called from it.
 */

import {
  backfillArtifactCodes,
  collectToolMessages,
  extractRetrievedCodes,
  type ToolMessageRecord,
} from './backfillCodes'
import type { PartialPriorAuthArtifact } from './artifactSchema'
import { buildEvidenceIndex } from './review/evidence'
import { codeGroundingCheck } from './review/checks/grounding'
import { structuralCompletenessCheck } from './review/checks/structural'
import { MESSAGES, labelForPointer, sectionIdForPointer } from './review/fieldPaths'
import { runChecks, type ArtifactCheck, type ReviewContext } from './review/registry'
import {
  MAX_ISSUES,
  MAX_MESSAGE_CHARS,
  type ArtifactReview,
  type ReviewIssue,
} from './review/types'

export { collectToolMessages }
export type { ToolMessageRecord }

export const DEFAULT_CHECKS: readonly ArtifactCheck[] = [
  structuralCompletenessCheck,
  codeGroundingCheck,
]

/**
 * `shadow` withholds the *findings* — the review is computed and returned to
 * the caller for logging, but never attached to the artifact, so no verdict
 * reaches a reader while the flag rate is being measured.
 *
 * It is not a full no-op: the deterministic code repairs still apply, exactly
 * as they did before this gate existed. Use `off` to disable everything.
 */
export type ReviewMode = 'off' | 'shadow' | 'on'

export function reviewModeFromEnv(): ReviewMode {
  const v = process.env.REVIEW_MODE
  return v === 'on' || v === 'off' || v === 'shadow' ? v : 'shadow'
}

export interface ReviewOptions {
  checks?: readonly ArtifactCheck[]
  timeoutMs?: number
  mode?: ReviewMode
}

export interface ReviewResult {
  /** repaired artifact, carrying `review` when mode is `on` */
  artifact: PartialPriorAuthArtifact
  review: ArtifactReview
  /** what the backfill did, for the existing log lines */
  filled: string[]
  skipped?: string
  /** the gate itself errored; the artifact is un-reviewed */
  failed?: boolean
}

function truncate(s: string): string {
  return s.length <= MAX_MESSAGE_CHARS ? s : `${s.slice(0, MAX_MESSAGE_CHARS - 1)}…`
}

const EMPTY_REVIEW: ArtifactReview = { v: 1, issues: [], checks: [], repairs: [] }

/** Drop any `review` the model emitted; only this module may set that field. */
function stripModelReview(
  artifact: PartialPriorAuthArtifact,
): PartialPriorAuthArtifact {
  if (!('review' in artifact)) return artifact
  const { review: _modelSupplied, ...rest } = artifact
  return rest
}

/**
 * Never throws. A gate that can fail the request it is supposed to protect is
 * worse than no gate — callers still have to fail open, but they should not
 * have to.
 */
export async function reviewArtifact(
  parsed: PartialPriorAuthArtifact,
  toolMessages: readonly ToolMessageRecord[],
  opts?: ReviewOptions,
): Promise<ReviewResult> {
  const mode = opts?.mode ?? reviewModeFromEnv()

  if (!parsed || typeof parsed !== 'object') {
    return { artifact: parsed, review: EMPTY_REVIEW, filled: [] }
  }

  // `review` is ours to write, never the model's to claim. It lives inside the
  // artifact envelope the model produces, so a hallucinated `review: {...}`
  // would render as a genuine verdict — including a green "checks passed" on
  // an answer nothing ever checked. Strip it before anything else, in every
  // mode, so the field can only ever mean what this function put there.
  const input = stripModelReview(parsed)

  if (mode === 'off') {
    return { artifact: input, review: EMPTY_REVIEW, filled: [] }
  }

  try {
    const evidence = buildEvidenceIndex(toolMessages)

    // --- deterministic repair --------------------------------------------
    const codes = extractRetrievedCodes(toolMessages.map((m) => m.content))
    const {
      artifact: repaired,
      filled,
      skipped,
    } = backfillArtifactCodes(input, codes)

    const repairs: ArtifactReview['repairs'] = filled.map((path) => ({
      path,
      kind: 'code-backfill' as const,
    }))

    const ctx: ReviewContext = { artifact: repaired, evidence, repairs }
    const { issues, runs } = await runChecks(ctx, opts?.checks ?? DEFAULT_CHECKS, {
      timeoutMs: opts?.timeoutMs,
    })

    // Repairs are recorded as findings too, so the reader can see that a list
    // was filled in for them rather than produced by the agent.
    const repairIssues: ReviewIssue[] = repairs.map((r) => ({
      code: 'repair-code-backfill' as const,
      severity: 'info' as const,
      checkId: 'code-backfill',
      path: r.path,
      sectionId: sectionIdForPointer(r.path),
      label: labelForPointer(r.path),
      message: MESSAGES.repairCodeBackfill,
    }))

    const all = [...repairIssues, ...issues].map((i) => ({
      ...i,
      message: truncate(i.message),
    }))

    // A truncated list must not read as a clean one.
    const kept = all.slice(0, MAX_ISSUES)
    const review: ArtifactReview = {
      v: 1,
      issues: kept,
      checks: runs,
      repairs,
      ...(all.length > kept.length ? { omittedCount: all.length - kept.length } : {}),
    }

    const artifact =
      mode === 'on' ? { ...repaired, review } : repaired

    return { artifact, review, filled, skipped }
  } catch (e) {
    // Fall back to the un-reviewed artifact rather than losing it — but say so.
    // No `review` is attached, so nothing claims to have passed; the danger is
    // that a gate failing on every request looks exactly like a clean codebase.
    console.error('[Review] Gate failed; delivering un-reviewed artifact:', e)
    return { artifact: input, review: EMPTY_REVIEW, filled: [], failed: true }
  }
}
