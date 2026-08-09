/**
 * Findings produced by the review gate that runs between the agent finishing
 * and the artifact reaching the client.
 *
 * Defined zod-first: the TypeScript types are inferred from the schemas, so
 * this subtree cannot drift the way the artifact's hand-written interface and
 * hand-written zod object have (adding `suggestedCodesNote` needed two edits in
 * two places, which is exactly the failure this avoids).
 *
 * This module deliberately imports nothing from `../artifactSchema` — that file
 * imports `reviewSchema` from here, and keeping the dependency one-directional
 * keeps the runtime import graph acyclic.
 */

import { z } from 'zod'

/**
 * `blocker` is reserved and currently unused: the gate informs, it never
 * withholds an answer. It exists so a future check that genuinely must stop
 * delivery has a severity to use without a schema change.
 */
export const reviewSeveritySchema = z.enum(['blocker', 'warning', 'info'])
export type ReviewSeverity = z.infer<typeof reviewSeveritySchema>

export const reviewIssueCodeSchema = z.enum([
  // --- structural completeness -------------------------------------------
  /** zod rejected the value at this path */
  'schema-invalid',
  /** a section the agent must always produce is absent */
  'section-missing',
  /** present but empty, so it renders as nothing and renumbers what follows */
  'section-empty',
  /** present in a context that forbids it (Medicare policies on commercial) */
  'section-not-applicable',
  /** a field this artifact's context requires is missing */
  'field-required-by-context',
  /** a top-level key the schema does not describe */
  'unknown-field',

  // --- code grounding ----------------------------------------------------
  /** the tools returned codes of this kind and this one is not among them */
  'code-not-in-evidence',
  /** cannot be judged: the tools that ran carry no codes of this kind */
  'code-evidence-unavailable',
  /** grounded, but only to sources that are not about this request */
  'code-source-out-of-scope',
  /** grounded, but only to a policy's non-covered list */
  'code-cited-as-non-covered',
  /**
   * Grounded and in scope, but only to a broad catalog — while a
   * procedure-specific source covering this same request was also retrieved
   * and does not list it.
   */
  'code-only-in-broader-source',

  // --- provenance --------------------------------------------------------
  /** a deterministic repair filled this field; not a defect */
  'repair-code-backfill',
])
export type ReviewIssueCode = z.infer<typeof reviewIssueCodeSchema>

export const reviewIssueSchema = z.object({
  code: reviewIssueCodeSchema,
  severity: reviewSeveritySchema,
  /** id of the check that raised it */
  checkId: z.string(),
  /** dotted path with indices, e.g. `relevantCodes.cpt[3].code` */
  path: z.string(),
  /** section that displays this path, for banner grouping and anchor links */
  sectionId: z.string().optional(),
  /** user-facing field name, e.g. `Relevant Codes → CPT / HCPCS` */
  label: z.string(),
  /**
   * User-facing sentence. MUST come from the fixed template catalog in
   * `messages.ts` — never interpolate artifact free text. This value is
   * persisted to chat_messages and embedded in exported PDFs, so echoing
   * clinical narrative here would leak PHI into both.
   */
  message: z.string(),
  /** machine detail for logs and debugging; never rendered raw */
  meta: z
    .record(z.string(), z.union([z.string(), z.number(), z.array(z.string())]))
    .optional(),
})
export type ReviewIssue = z.infer<typeof reviewIssueSchema>

export const reviewCheckRunSchema = z.object({
  id: z.string(),
  /**
   * `skipped` is a first-class outcome, not a failure — a check that cannot
   * answer must say so rather than guess. Persisted so the PDF can state, for
   * example, that scoping was not evaluated because the corpus could not supply
   * per-document procedure lists.
   *
   * `partial` is the same honesty applied one level down: the check ran, but
   * one of its tests could not. Without it a half-inert check reports `ok` and
   * its green tick claims coverage nothing performed — the same way a gate
   * failing on every request looks exactly like a clean codebase.
   */
  status: z.enum(['ok', 'partial', 'skipped', 'error']),
  reason: z.string().optional(),
  issueCount: z.number(),
})
// Deliberately no timing field: the review is persisted with every artifact,
// and a duration would make two runs over identical input differ, for
// information that belongs in a log line rather than in the record.
export type ReviewCheckRun = z.infer<typeof reviewCheckRunSchema>

export const reviewRepairSchema = z.object({
  path: z.string(),
  kind: z.literal('code-backfill'),
})
export type ReviewRepair = z.infer<typeof reviewRepairSchema>

export const reviewSchema = z.object({
  v: z.literal(1),
  issues: z.array(reviewIssueSchema),
  checks: z.array(reviewCheckRunSchema),
  /** deterministic fixes applied before the checks ran */
  repairs: z.array(reviewRepairSchema),
  /** issues dropped by MAX_ISSUES, so a truncated list never reads as clean */
  omittedCount: z.number().optional(),
})
export type ArtifactReview = z.infer<typeof reviewSchema>

/** Keeps a pathological run from bloating every persisted message. */
export const MAX_ISSUES = 50
export const MAX_MESSAGE_CHARS = 200

const SEVERITY_RANK: Record<ReviewSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
}

/** Stable ordering: severest first, then by path, so output is deterministic. */
export function sortIssues(issues: readonly ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code),
  )
}

export function countBySeverity(
  issues: readonly ReviewIssue[],
): Record<ReviewSeverity, number> {
  const counts: Record<ReviewSeverity, number> = { blocker: 0, warning: 0, info: 0 }
  for (const i of issues) counts[i.severity]++
  return counts
}
