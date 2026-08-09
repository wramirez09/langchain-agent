/**
 * The one place an assistant answer becomes the thing the client receives.
 *
 * Both delivery paths run through here — the buffered mobile/API branch and the
 * web branch — so "web and mobile behave identically" is a property of the code
 * rather than a convention two call sites are trusted to keep. They previously
 * drifted: the mobile branch used `JSON.parse`, the web branch used
 * `parsePartialJson`, and only one of them could repair an answer at all.
 *
 * Everything here is best-effort by construction. A gate that fails must cost
 * the caller nothing more than an un-reviewed answer.
 */

import { isPriorAuthArtifact, type PriorAuthArtifact } from '@/lib/priorAuth/artifactSchema'
import { parsePartialJson } from '@/lib/priorAuth/partialJson'
import type { BackfillSkipReason, ToolMessageRecord } from '@/lib/priorAuth/backfillCodes'
import {
  reviewArtifact,
  reviewModeFromEnv,
  type ReviewMode,
} from '@/lib/priorAuth/reviewArtifact'
import type { ArtifactReview, ReviewSeverity } from '@/lib/priorAuth/review/types'
import { countBySeverity } from '@/lib/priorAuth/review/types'

export interface FinalizeArgs {
  /** the assistant's final text, exactly as the model produced it */
  text: string
  toolMessages: readonly ToolMessageRecord[]
  userId: string
  mode?: ReviewMode
}

export interface FinalizeResult {
  /** parsed artifact when the answer was one, otherwise the original text */
  payload: string | PriorAuthArtifact
  /** what to send and persist — always a string, never undefined */
  persistText: string
  /** true when the answer parsed as an artifact and went through the gate */
  reviewed: boolean
  review?: ArtifactReview
  filled: string[]
  skipped?: BackfillSkipReason | string
  issueCounts: Record<ReviewSeverity, number>
}

const NO_ISSUES: Record<ReviewSeverity, number> = { blocker: 0, warning: 0, info: 0 }

function passthrough(text: string): FinalizeResult {
  return {
    payload: text,
    persistText: text,
    reviewed: false,
    filled: [],
    issueCounts: NO_ISSUES,
  }
}

export async function finalizeAssistantAnswer(
  args: FinalizeArgs,
): Promise<FinalizeResult> {
  const { text, toolMessages, userId } = args
  if (!text) return passthrough('')

  // Tolerant of a truncated tail, unlike the plain JSON.parse the mobile branch
  // used to do — an artifact that lost its last brace is still worth repairing
  // rather than silently degrading to raw JSON text on screen.
  const parsed = parsePartialJson<Record<string, unknown>>(text)
  if (!parsed || !isPriorAuthArtifact(parsed)) return passthrough(text)

  const mode = args.mode ?? reviewModeFromEnv()
  const { artifact, review, filled, skipped, failed } = await reviewArtifact(
    parsed,
    toolMessages,
    { mode },
  )

  const issueCounts = countBySeverity(review.issues)

  if (filled.length > 0) {
    console.log(
      `[Agents] Repaired code fields for user ${userId}: ${filled.join(', ')}`,
    )
  } else if (skipped && skipped !== 'nothing-empty') {
    console.log(`[Agents] Code repair skipped for user ${userId}: ${skipped}`)
  }

  // Logged on EVERY reviewed answer, including clean ones. Shadow mode exists
  // to measure how often the gate fires before it is shown to anyone, and a
  // line emitted only on findings gives a numerator with no denominator.
  const unrun = review.checks
    .filter((c) => c.status !== 'ok')
    .map((c) => `${c.id}:${c.status}(${c.reason ?? ''})`)
  console.log(
    `[Review] mode=${mode} user=${userId} ` +
      `warnings=${issueCounts.warning} info=${issueCounts.info} ` +
      `repairs=${filled.length} ` +
      `checks=${review.checks.length} unrun=${unrun.length}` +
      (unrun.length ? ` [${unrun.join(', ')}]` : '') +
      (failed ? ' GATE_FAILED' : ''),
  )

  return {
    payload: artifact as PriorAuthArtifact,
    // Serialized from the reviewed artifact, so what is persisted, replayed,
    // and exported is exactly what the client was sent.
    persistText: JSON.stringify(artifact),
    reviewed: true,
    review,
    filled,
    skipped,
    issueCounts,
  }
}
