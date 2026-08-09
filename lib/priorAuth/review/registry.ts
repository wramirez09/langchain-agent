/**
 * Runs the checks and guarantees they cannot take the answer down with them.
 *
 * Every check is isolated twice — try/caught and raced against a timeout — so a
 * bug or a hang in one contributes an `error` status and zero findings while
 * the others still run. A review that fails is worth strictly less than a
 * report that ships; it is never worth more.
 *
 * `run` is async even though both current checks are synchronous. That is
 * deliberate: it is what lets a future model-backed check (verbatim numeric
 * thresholds, cross-source reconciliation) slot in without reshaping the
 * orchestrator or any of its callers.
 */

import type { PartialPriorAuthArtifact } from '../artifactSchema'
import type { EvidenceIndex } from './evidence'
import type { ArtifactReview, ReviewCheckRun, ReviewIssue } from './types'
import { sortIssues } from './types'

export interface ReviewContext {
  /** post-repair artifact: checks see what the reader will see */
  artifact: PartialPriorAuthArtifact
  evidence: EvidenceIndex
  repairs: ArtifactReview['repairs']
}

export interface ArtifactCheck {
  id: string
  title: string
  /** return a reason to skip; undefined to run */
  skipReason?: (ctx: ReviewContext) => string | undefined
  run: (ctx: ReviewContext) => ReviewIssue[] | Promise<ReviewIssue[]>
}

export const DEFAULT_CHECK_TIMEOUT_MS = 3_000

interface RunChecksResult {
  issues: ReviewIssue[]
  runs: ReviewCheckRun[]
  /** per-check durations, for logging only — never persisted */
  timings: Record<string, number>
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`check timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runChecks(
  ctx: ReviewContext,
  checks: readonly ArtifactCheck[],
  opts?: { timeoutMs?: number },
): Promise<RunChecksResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
  const issues: ReviewIssue[] = []
  const runs: ReviewCheckRun[] = []
  const timings: Record<string, number> = {}

  for (const check of checks) {
    const started = Date.now()

    let skip: string | undefined
    try {
      skip = check.skipReason?.(ctx)
    } catch {
      skip = 'skip-condition-failed'
    }

    if (skip) {
      timings[check.id] = Date.now() - started
      runs.push({ id: check.id, status: 'skipped', reason: skip, issueCount: 0 })
      continue
    }

    try {
      const found = await withTimeout(
        Promise.resolve().then(() => check.run(ctx)),
        timeoutMs,
      )
      const list = Array.isArray(found) ? found : []
      issues.push(...list)
      timings[check.id] = Date.now() - started
      runs.push({ id: check.id, status: 'ok', issueCount: list.length })
    } catch (e) {
      // A check that throws contributes nothing rather than partial findings —
      // half a check's opinion is not an opinion.
      timings[check.id] = Date.now() - started
      runs.push({
        id: check.id,
        status: 'error',
        reason: e instanceof Error ? e.message : 'check failed',
        issueCount: 0,
      })
    }
  }

  return { issues: sortIssues(issues), runs, timings }
}
