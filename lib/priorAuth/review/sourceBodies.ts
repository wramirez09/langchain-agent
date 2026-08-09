/**
 * Reads full guideline text straight from the corpus for the review gate.
 *
 * The agent never sees a whole document — `CommercialGuidelineSearchTool` hands
 * it a relevance-selected excerpt capped at 12k characters, shrunk further when
 * the tool output exceeds its budget, against bodies that run past 17k. That is
 * the right trade for the agent, which needs the decisive passages inside a
 * prompt. It is the wrong basis for a check: text quoted correctly from a part
 * of the document the excerpt happened to drop would look invented.
 *
 * So the review reads the source itself. This is the only place in the review
 * subtree that touches the database, kept apart from `evidence.ts` so that
 * module stays pure and unit-testable, and injected as a `BodyFetcher`.
 */

import { supabaseAdmin } from '../../supabaseAdmin'
import { cache, TTL } from '../../cache'

/**
 * Bodies change only when the corpus is re-ingested, so they cache well. The
 * key is versioned so a schema or ingest change can invalidate cleanly.
 */
function bodyCacheKey(id: string): string {
  return `guideline-body:v1:${id}`
}

/**
 * Fetch bodies for the given corpus ids. Missing ids are simply absent from the
 * returned map — the caller treats absence as "no text available", never as
 * "the document is empty".
 *
 * Never throws: a review that cannot read the corpus falls back to checking
 * nothing rather than failing the answer.
 */
export async function fetchCommercialBodies(
  corpusIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (corpusIds.length === 0) return out

  const missing: string[] = []
  for (const id of corpusIds) {
    const hit = cache.get<string>(bodyCacheKey(id))
    if (typeof hit === 'string') out.set(id, hit)
    else missing.push(id)
  }
  if (missing.length === 0) return out

  try {
    const { data, error } = await supabaseAdmin
      .from('commercial_guidelines')
      .select('id, body')
      .in('id', missing)

    if (error) {
      console.warn('[Review] guideline body fetch failed:', error.message)
      return out
    }

    for (const row of data ?? []) {
      const id = (row as { id?: unknown }).id
      const body = (row as { body?: unknown }).body
      if (typeof id !== 'string' || typeof body !== 'string' || !body) continue
      cache.set(bodyCacheKey(id), body, TTL.VERY_LONG)
      out.set(id, body)
    }
  } catch (e) {
    console.warn('[Review] guideline body fetch threw:', (e as Error).message)
  }

  return out
}
