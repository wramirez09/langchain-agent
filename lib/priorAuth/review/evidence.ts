/**
 * A normalized view of everything the tools actually returned during a run.
 *
 * The grounding check needs one question answered cheaply — "did any source we
 * retrieved actually contain this code?" — but the tools disagree about how to
 * say so. Commercial search emits `"72148 — MRI lumbar spine"` strings; the
 * Medicare tools emit `{code, description, context}` objects; several tools
 * return documents with no codes at all. This module flattens all of that into
 * one index.
 *
 * Two properties matter more than completeness:
 *
 * 1. `usable` and `truncated` let the caller distinguish "this code is not in
 *    the sources" from "we cannot tell". Only the first is a finding.
 * 2. Sources are recorded even when they carry no codes, because "Medicare
 *    retrieval happened and returned nothing" and "Medicare retrieval never
 *    ran" imply different things about a missing policies section.
 */

import { normalizeCode, parseLabeledCode, type ToolMessageRecord } from '../backfillCodes'

/** Whether a source presents a code as covered, excluded, or neither. */
export type Supports = 'yes' | 'no' | 'unknown'

export interface EvidenceSource {
  /** stable within a run, e.g. `cgs:abc123`, `mpd:lcd:L34567:3`, `pce:<url>` */
  id: string
  tool: string
  title: string
  /** `related` matches are legitimate grounding, just lower-ranked */
  rank: 'top' | 'related' | 'detail'
  score?: number
  procedures: string[]
  /**
   * False when the corpus cannot supply a procedure list at all — either the
   * `procedures` column migration is unapplied, or the source type has no such
   * concept (every Medicare policy). Distinct from "covers zero procedures",
   * which is not a thing any real document is.
   */
  proceduresKnown: boolean
  isMedicare: boolean
  /**
   * Full source text, re-fetched from the corpus rather than taken from the
   * tool output.
   *
   * The agent is handed a relevance-selected *excerpt* — capped at 12k
   * characters against bodies that run past 17k, and trimmed further when the
   * tool output exceeds its budget. Checking quoted text against that excerpt
   * would report "not in the source" for material that is in the source and
   * merely outside the window, which is the false accusation this whole module
   * is built to avoid. Absent when the fetch did not run or did not find it.
   */
  body?: string
}

export interface EvidenceCodeHit {
  code: string
  raw: string
  label: string
  kind: 'cpt' | 'icd10'
  sourceId: string
  /** Medicare `context` verbatim; absent for commercial sources */
  context?: string
  supports: Supports
}

export interface EvidenceIndex {
  sources: Map<string, EvidenceSource>
  /** normalized code → every hit for it */
  byCode: Map<string, EvidenceCodeHit[]>
  cptCount: number
  icd10Count: number
  /** at least one evidence tool produced parseable output */
  usable: boolean
  /** we dropped tool output for size, so absence is no longer provable */
  truncated: boolean
  hasMedicareSource: boolean
  parseFailures: { tool: string; reason: string }[]
}

/**
 * Total tool output we will read. A pathological run should degrade to
 * "cannot judge" rather than pin the event loop parsing megabytes of JSON.
 */
export const MAX_EVIDENCE_CHARS = 1_000_000

/**
 * LCD code lists merge codes the policy supports with codes it explicitly
 * excludes; the `context` string is the only thing telling them apart. See
 * cmsCoverageApiClient, which writes both into one array.
 */
function supportsFromContext(context: unknown): Supports {
  if (typeof context !== 'string') return 'unknown'
  if (/does not support|not medically necessary|non-?covered|exclu/i.test(context)) {
    return 'no'
  }
  if (/supports medical necessity|covered/i.test(context)) return 'yes'
  return 'unknown'
}

interface Builder {
  sources: Map<string, EvidenceSource>
  byCode: Map<string, EvidenceCodeHit[]>
  parseFailures: { tool: string; reason: string }[]
}

function addSource(b: Builder, s: EvidenceSource): void {
  if (!b.sources.has(s.id)) b.sources.set(s.id, s)
}

function addCode(b: Builder, hit: EvidenceCodeHit): void {
  if (!hit.code) return
  const list = b.byCode.get(hit.code)
  if (list) list.push(hit)
  else b.byCode.set(hit.code, [hit])
}

/** `"72148 — MRI lumbar spine"` → a hit. Commercial shape. */
function addLabeledCodes(
  b: Builder,
  raw: unknown,
  kind: 'cpt' | 'icd10',
  sourceId: string,
): void {
  if (!Array.isArray(raw)) return
  for (const entry of raw) {
    const parsed = parseLabeledCode(entry)
    if (!parsed) continue
    addCode(b, {
      code: normalizeCode(parsed.code),
      raw: typeof entry === 'string' ? entry : parsed.code,
      label: parsed.label,
      kind,
      sourceId,
      supports: 'unknown',
    })
  }
}

/** `{code, description, context}` → a hit. Medicare shape. */
function addObjectCodes(
  b: Builder,
  raw: unknown,
  kind: 'cpt' | 'icd10',
  sourceId: string,
): void {
  if (!Array.isArray(raw)) return
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as { code?: unknown; description?: unknown; context?: unknown }
    const code = normalizeCode(e.code)
    if (!code) continue
    addCode(b, {
      code,
      raw: typeof e.code === 'string' ? e.code : code,
      label: typeof e.description === 'string' ? e.description : '',
      kind,
      sourceId,
      context: typeof e.context === 'string' ? e.context : undefined,
      supports: supportsFromContext(e.context),
    })
  }
}

interface CommercialMatch {
  id?: unknown
  title?: unknown
  score?: unknown
  procedures?: unknown
  cptCodes?: unknown
  icd10Codes?: unknown
}

function ingestCommercial(b: Builder, parsed: unknown, tool: string): void {
  const o = parsed as { topMatches?: unknown; relatedMatches?: unknown }
  const groups: Array<[unknown, 'top' | 'related']> = [
    [o?.topMatches, 'top'],
    // Read related matches too. `extractRetrievedCodes` deliberately ignores
    // them (it wants the single best document), but a code the model took from
    // a related match is genuinely grounded, and flagging it as invented would
    // be a false accusation.
    [o?.relatedMatches, 'related'],
  ]

  for (const [list, rank] of groups) {
    if (!Array.isArray(list)) continue
    for (let i = 0; i < list.length; i++) {
      const m = list[i] as CommercialMatch
      if (!m || typeof m !== 'object') continue
      const title = typeof m.title === 'string' ? m.title : ''
      const id = `cgs:${typeof m.id === 'string' && m.id ? m.id : `${rank}:${i}:${title}`}`
      const procedures = Array.isArray(m.procedures)
        ? m.procedures.filter((p): p is string => typeof p === 'string')
        : []

      addSource(b, {
        id,
        tool,
        title,
        rank,
        score: typeof m.score === 'number' ? m.score : undefined,
        procedures,
        // The tool maps a missing column to `[]`, so an empty list means
        // "we were not told", never "this document covers nothing".
        proceduresKnown: procedures.length > 0,
        isMedicare: false,
      })

      addLabeledCodes(b, m.cptCodes, 'cpt', id)
      addLabeledCodes(b, m.icd10Codes, 'icd10', id)
    }
  }
}

/** Shared by medicare_policy_detail and policy_content_extractor. */
function ingestPolicyDetail(
  b: Builder,
  parsed: unknown,
  tool: string,
  fallbackId: string,
): void {
  const o = parsed as {
    error?: unknown
    documentType?: unknown
    documentId?: unknown
    documentVersion?: unknown
    policyUrl?: unknown
    summary?: unknown
    cptCodes?: unknown
    icd10Codes?: unknown
  }
  if (!o || typeof o !== 'object') return

  // An error payload is not a source — treating it as one would let a failed
  // fetch count as "we looked and the code was not there".
  if (typeof o.error === 'string') {
    b.parseFailures.push({ tool, reason: o.error })
    return
  }

  const id =
    typeof o.policyUrl === 'string' && o.policyUrl
      ? `pce:${o.policyUrl}`
      : typeof o.documentId === 'string' && o.documentId
        ? `mpd:${String(o.documentType ?? '')}:${o.documentId}:${String(o.documentVersion ?? '')}`
        : fallbackId

  addSource(b, {
    id,
    tool,
    title:
      typeof o.documentId === 'string' && o.documentId
        ? o.documentId
        : typeof o.policyUrl === 'string'
          ? o.policyUrl
          : '',
    rank: 'detail',
    procedures: [],
    // Medicare policies are scoped by policy, not by a procedure list.
    proceduresKnown: false,
    isMedicare: true,
  })

  addObjectCodes(b, o.cptCodes, 'cpt', id)
  addObjectCodes(b, o.icd10Codes, 'icd10', id)
}

/** `{query, topMatches}` shapes that carry documents but no codes. */
function ingestMedicareSearch(b: Builder, parsed: unknown, tool: string): void {
  const matches = (parsed as { topMatches?: unknown })?.topMatches
  if (!Array.isArray(matches)) return
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i] as { id?: unknown; title?: unknown; score?: unknown }
    if (!m || typeof m !== 'object') continue
    addSource(b, {
      id: `${tool}:${typeof m.id === 'string' ? m.id : i}`,
      tool,
      title: typeof m.title === 'string' ? m.title : '',
      rank: 'top',
      score: typeof m.score === 'number' ? m.score : undefined,
      procedures: [],
      proceduresKnown: false,
      isMedicare: true,
    })
  }
}

const KNOWN_TOOLS = new Set([
  'commercial_guidelines_search',
  'medicare_policy_detail',
  'policy_content_extractor',
  'medicare_multi_search',
  'ncd_coverage_search',
  'local_lcd_search',
  'local_coverage_article_search',
])

function ingestOne(b: Builder, msg: ToolMessageRecord): void {
  // Checked before parsing: unrecognized tools (SerpAPI and anything added
  // later) return free text, and failing to JSON.parse that is expected, not a
  // parse failure worth reporting.
  if (!KNOWN_TOOLS.has(msg.name)) return

  let parsed: unknown
  try {
    parsed = JSON.parse(msg.content)
  } catch {
    b.parseFailures.push({ tool: msg.name, reason: 'unparseable JSON' })
    return
  }

  switch (msg.name) {
    case 'commercial_guidelines_search':
      ingestCommercial(b, parsed, msg.name)
      return

    case 'medicare_policy_detail':
      ingestPolicyDetail(b, parsed, msg.name, `mpd:${b.sources.size}`)
      return

    case 'policy_content_extractor': {
      // One URL yields a single object; several yield a JSON array of JSON
      // *strings*, each needing a second parse.
      if (Array.isArray(parsed)) {
        parsed.forEach((el, i) => {
          if (typeof el !== 'string') return
          try {
            ingestPolicyDetail(b, JSON.parse(el), msg.name, `pce:${i}`)
          } catch {
            b.parseFailures.push({ tool: msg.name, reason: 'unparseable element' })
          }
        })
        return
      }
      ingestPolicyDetail(b, parsed, msg.name, `pce:${b.sources.size}`)
      return
    }

    case 'medicare_multi_search': {
      const o = parsed as Record<string, unknown>
      for (const key of ['ncd', 'lcd', 'lca']) {
        if (o?.[key]) ingestMedicareSearch(b, o[key], `${msg.name}:${key}`)
      }
      return
    }

    case 'ncd_coverage_search':
    case 'local_lcd_search':
    case 'local_coverage_article_search':
      ingestMedicareSearch(b, parsed, msg.name)
      return

    default:
      return
  }
}

export function buildEvidenceIndex(
  msgs: readonly ToolMessageRecord[],
): EvidenceIndex {
  const b: Builder = { sources: new Map(), byCode: new Map(), parseFailures: [] }

  let budget = MAX_EVIDENCE_CHARS
  let truncated = false
  for (const msg of msgs ?? []) {
    if (typeof msg?.content !== 'string') continue
    if (msg.content.length > budget) {
      truncated = true
      continue
    }
    budget -= msg.content.length
    ingestOne(b, msg)
  }

  let cptCount = 0
  let icd10Count = 0
  for (const hits of b.byCode.values()) {
    if (hits.some((h) => h.kind === 'cpt')) cptCount++
    if (hits.some((h) => h.kind === 'icd10')) icd10Count++
  }

  let hasMedicareSource = false
  for (const s of b.sources.values()) {
    if (s.isMedicare) {
      hasMedicareSource = true
      break
    }
  }

  return {
    sources: b.sources,
    byCode: b.byCode,
    cptCount,
    icd10Count,
    usable: b.sources.size > 0,
    truncated,
    hasMedicareSource,
    parseFailures: b.parseFailures,
  }
}

export const EMPTY_EVIDENCE: EvidenceIndex = {
  sources: new Map(),
  byCode: new Map(),
  cptCount: 0,
  icd10Count: 0,
  usable: false,
  truncated: false,
  hasMedicareSource: false,
  parseFailures: [],
}

// ---------------------------------------------------------------------------
// Full-text hydration
// ---------------------------------------------------------------------------

/** `cgs:muscle/cervical-laminectomy.md` → the corpus id, or null. */
export function corpusIdOf(sourceId: string): string | null {
  return sourceId.startsWith('cgs:') ? sourceId.slice(4) || null : null
}

/**
 * The sources worth paying a round trip for, best first.
 *
 * `top` outranks `related`, then score descending, then id for a stable order
 * on ties — a review that reads different sources run to run over identical
 * input would make its own findings irreproducible.
 */
export function rankedCommercialSources(
  index: EvidenceIndex,
  limit: number,
): EvidenceSource[] {
  const rankWeight = (r: EvidenceSource['rank']) => (r === 'top' ? 0 : r === 'detail' ? 1 : 2)
  return [...index.sources.values()]
    .filter((s) => corpusIdOf(s.id) !== null)
    .sort(
      (a, b) =>
        rankWeight(a.rank) - rankWeight(b.rank) ||
        (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(0, limit))
}

/** Injected so this module keeps no database dependency and stays unit-testable. */
export type BodyFetcher = (corpusIds: string[]) => Promise<Map<string, string>>

export interface HydrateResult {
  /** how many sources came back with text */
  hydrated: number
  /** the fetch failed or timed out; sources keep no body and checks must not assume absence */
  failed?: boolean
}

/**
 * Attach full source text to the top-ranked commercial sources, in place.
 *
 * Bounded on purpose: two documents, because that covers the document a request
 * is about plus its nearest rival, and every additional one is latency paid on
 * every reviewed answer for a source no finding is likely to cite.
 *
 * Never throws. A review that cannot read the corpus is worth less than one
 * that ships; it is never worth more.
 */
export async function hydrateSourceBodies(
  index: EvidenceIndex,
  fetchBodies: BodyFetcher,
  opts?: { limit?: number; timeoutMs?: number },
): Promise<HydrateResult> {
  const limit = opts?.limit ?? 2
  const targets = rankedCommercialSources(index, limit)
  if (targets.length === 0) return { hydrated: 0 }

  const ids = targets.map((s) => corpusIdOf(s.id)!)

  let bodies: Map<string, string>
  try {
    const timeoutMs = opts?.timeoutMs ?? 2_000
    bodies = await Promise.race([
      fetchBodies(ids),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('body fetch timed out')), timeoutMs).unref?.(),
      ),
    ])
  } catch {
    return { hydrated: 0, failed: true }
  }

  let hydrated = 0
  for (const s of targets) {
    const body = bodies?.get(corpusIdOf(s.id)!)
    if (typeof body === 'string' && body.trim()) {
      s.body = body
      hydrated++
    }
  }
  return { hydrated }
}
