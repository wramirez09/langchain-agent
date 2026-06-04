import { StructuredTool } from "@langchain/core/tools";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cache, TTL } from "@/lib/cache";
import { embedQuery } from "@/lib/embeddings";
import { sha256Hex } from "@/lib/text";
import {
  CommercialGuidelineSearchInputSchema,
  CommercialGuidelineSearchInput,
  CommercialGuidelineSearchOutput,
  ScoredResult,
} from "./utils/commercialGuidelineTypes";
import { labelCode } from "./utils/codeLabels";

// Output budget. Beyond this we shrink excerpts and trim arrays rather than
// invoking an LLM summarizer (which doubled latency and dropped the
// structured topMatches/relatedMatches shape the agent relies on).
const OUTPUT_BUDGET_CHARS = 55_000;
// Floor for excerpt shrinking under budget pressure. Kept high enough to retain
// the decisive criteria (conservative-therapy thresholds, etc.) that
// extractRelevantSections surfaces — a 200-char floor used to truncate them back
// off, defeating section-aware excerpting.
const MIN_EXCERPT_CHARS = 1200;

// Strip filesystem paths from tool output. The agent prompt forbids citing
// file/folder names; relying on the LLM to redact a field we hand it is a
// confidentiality footgun. Drop `path` and `mergedFrom[].path` at the
// serialization boundary so they cannot be leaked even on hallucination.
function redactResult(r: ScoredResult): Omit<ScoredResult, "path" | "body"> & {
  mergedFrom?: { id: string; title: string }[];
} {
  const { path: _path, body: _body, mergedFrom, ...rest } = r;
  return {
    ...rest,
    // Enrich each code with its guideline-sourced descriptor ("CODE — label")
    // so the agent can relay verified labels to the client instead of bare
    // codes or model-invented text.
    cptCodes: (rest.cptCodes ?? []).map(labelCode),
    icd10Codes: (rest.icd10Codes ?? []).map(labelCode),
    ...(mergedFrom
      ? { mergedFrom: mergedFrom.map(({ id, title }) => ({ id, title })) }
      : {}),
  };
}

function shrinkToFit(
  output: CommercialGuidelineSearchOutput,
): CommercialGuidelineSearchOutput {
  const project = (results: ScoredResult[]) => results.map(redactResult);

  const measure = (top: ScoredResult[], related: ScoredResult[]): string =>
    JSON.stringify(
      {
        query: output.query,
        topMatches: project(top),
        relatedMatches: project(related),
      },
      null,
      2,
    );

  let top = [...output.topMatches];
  let related = [...output.relatedMatches];
  let json = measure(top, related);
  if (json.length <= OUTPUT_BUDGET_CHARS)
    return { ...output, topMatches: top, relatedMatches: related };

  // 1) Drop relatedMatches entirely.
  related = [];
  json = measure(top, related);

  // 2) Shrink excerpts from the LOWEST-ranked match upward, preserving the top
  //    match's full content. The #1 result is the doc the request is actually
  //    about; the agent should see its original criteria verbatim rather than a
  //    trimmed/summarized slice. Lower-ranked matches are supporting context and
  //    are shrunk (then popped in step 3) first.
  for (
    let i = top.length - 1;
    i >= 1 && json.length > OUTPUT_BUDGET_CHARS;
    i--
  ) {
    if (top[i].excerpt.length > MIN_EXCERPT_CHARS) {
      top[i] = {
        ...top[i],
        excerpt: top[i].excerpt.slice(0, MIN_EXCERPT_CHARS).trim() + "…",
      };
      json = measure(top, related);
    }
  }

  // 3) Pop low-scoring topMatches until we fit (keep at least 1).
  while (json.length > OUTPUT_BUDGET_CHARS && top.length > 1) {
    top.pop();
    json = measure(top, related);
  }

  return { ...output, topMatches: top, relatedMatches: related };
}

interface RpcRow {
  id: string;
  title: string;
  domain: string | null;
  treatment: string | null;
  cpt_codes: string[] | null;
  icd10_codes: string[] | null;
  excerpt: string | null;
  body: string | null;
  score: number;
  signals: Record<string, number>;
}

function normCodes(v?: string | string[]): string[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((c) => c.trim()).filter(Boolean);
}

function rowToScoredResult(row: RpcRow): ScoredResult {
  const matchedOn: string[] = [];
  for (const [k, v] of Object.entries(row.signals || {})) {
    if (typeof v === "number" && v > 0) {
      matchedOn.push(`${k}:${typeof v === "number" ? v.toFixed(2) : v}`);
    }
  }
  return {
    id: row.id,
    title: row.title,
    score: row.score,
    domain: row.domain ?? "",
    matchedOn,
    excerpt: (row.excerpt ?? "").trim(),
    // Internal-only — stripped by redactResult before serialization. We
    // still need a string here to satisfy the type.
    path: "",
    treatment: row.treatment ?? undefined,
    cptCodes: row.cpt_codes ?? [],
    icd10Codes: row.icd10_codes ?? [],
  };
}

/**
 * Commercial Guideline Search Tool
 *
 * Hybrid retrieval over the Supabase-backed commercial guideline corpus:
 *   - Postgres FTS (ts_rank_cd over a weighted tsvector)
 *   - pgvector cosine similarity (text-embedding-3-small, HNSW index)
 *   - Exact-match boosts for CPT / ICD-10 / domain
 *
 * Everything runs in a single `search_commercial_guidelines` RPC call;
 * the only network hop besides Supabase is a (cached) embedding for the
 * query string.
 */
export class CommercialGuidelineSearchTool extends StructuredTool<
  typeof CommercialGuidelineSearchInputSchema
> {
  name = "commercial_guidelines_search";

  description = `Search commercial guidelines for prior authorization requirements using structured inputs.

This tool performs hybrid (lexical + semantic) search across commercial guideline documents to find relevant authorization criteria.

**When to use:**
- Guidelines is "Commercial" (never call this for Medicare queries)
- User asks about commercial insurance authorization requirements
- Query mentions treatments, procedures, or diagnoses

**NEVER call this tool when Guidelines is "Medicare".** Use ncd_coverage_search, local_lcd_search, and local_coverage_article_search instead.

**Input fields:**
- query: Main search query (required)
- treatment: Specific treatment name (optional)
- diagnosis: Diagnosis description (optional)
- cpt: CPT/HCPCS for exact-match boost (optional)
- icd10: ICD-10 code(s) for exact-match boost (optional)
- domain: Domain filter (optional, e.g., "cardio", "genetic", "muscle")
- payer: Payer name (optional)
- maxResults: Number of results (optional, default: 5)

**Output:** JSON with topMatches and relatedMatches; each item has title, score, domain, matchedOn (lex/sem/cpt/icd/dom signals), excerpt, cptCodes, icd10Codes.

**CRITICAL CONFIDENTIALITY:**
Never mention specific data sources, tool names, URLs, file names, folder names, or document references in your response. Use ONLY generic terms like "commercial guidelines", "proprietary criteria", or "industry standards".`;

  schema = CommercialGuidelineSearchInputSchema;

  async _call(input: CommercialGuidelineSearchInput): Promise<string> {
    const toolStart = Date.now();
    console.log("[CommercialGuidelineSearchTool] Received input:", input);

    const cptArr = normCodes(input.cpt);
    const icdArr = normCodes(input.icd10).map((c) => c.toUpperCase());
    const maxResults = input.maxResults ?? 5;

    // Use the structured fields when present so the embedding reflects the
    // full clinical context (synonyms in `treatment`, codes routed through
    // the boost path rather than the vector).
    const queryText = [input.query, input.treatment, input.diagnosis]
      .filter(Boolean)
      .join(" \n ");

    // Cache the entire RPC payload keyed on a hash of the normalized
    // input. Same query → same cache hit, no embedding or RPC call.
    const cacheKey = `commercial-search:v1:${sha256Hex(
      JSON.stringify({
        q: queryText,
        cpt: cptArr,
        icd: icdArr,
        d: input.domain ?? null,
        n: maxResults,
      }),
    )}`;
    const cached = cache.get<string>(cacheKey);
    if (cached) {
      console.log(`[CommercialGuidelineSearchTool] Cache hit (${Date.now() - toolStart}ms)`);
      return cached;
    }

    try {
      const embedStart = Date.now();
      const queryVec = await embedQuery(queryText);
      console.log(`[CommercialGuidelineSearchTool] Embed: ${Date.now() - embedStart}ms`);

      const rpcStart = Date.now();
      const { data, error } = await supabaseAdmin.rpc("search_commercial_guidelines", {
        q_text: queryText,
        // supabase-js serializes number[] for vector columns; convert
        // Float32Array → number[].
        q_embedding: Array.from(queryVec),
        q_cpt: cptArr,
        q_icd10: icdArr,
        q_domain: input.domain ?? null,
        // Fetch a few extra to populate relatedMatches.
        max_results: maxResults + 3,
      });
      console.log(`[CommercialGuidelineSearchTool] RPC: ${Date.now() - rpcStart}ms`);

      if (error) {
        console.error("[CommercialGuidelineSearchTool] RPC error:", error);
        return JSON.stringify({
          query: input.query,
          topMatches: [],
          relatedMatches: [],
          error: error.message,
        });
      }

      const rows = (data ?? []) as RpcRow[];
      const scored = rows.map(rowToScoredResult);
      const topMatches = scored.slice(0, maxResults);
      const relatedMatches = scored.slice(maxResults, maxResults + 3);

      const output: CommercialGuidelineSearchOutput = {
        query: input.query,
        topMatches,
        relatedMatches,
      };

      const fitted = shrinkToFit(output);
      const jsonOutput = JSON.stringify(
        {
          query: fitted.query,
          topMatches: fitted.topMatches.map(redactResult),
          relatedMatches: fitted.relatedMatches.map(redactResult),
          ...(fitted.topMatches.length < topMatches.length ||
          fitted.relatedMatches.length < relatedMatches.length
            ? {
                truncated: {
                  originalTopMatches: topMatches.length,
                  originalRelatedMatches: relatedMatches.length,
                },
              }
            : {}),
        },
        null,
        2,
      );

      cache.set(cacheKey, jsonOutput, TTL.LONG);
      console.log(
        `[CommercialGuidelineSearchTool] Done in ${Date.now() - toolStart}ms: ${topMatches.length} top, ${relatedMatches.length} related, ${jsonOutput.length} chars`,
      );
      return jsonOutput;
    } catch (error) {
      console.error(
        "[CommercialGuidelineSearchTool] Error during search:",
        error,
      );
      return JSON.stringify({
        query: input.query,
        topMatches: [],
        relatedMatches: [],
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during search",
      });
    }
  }
}

export function createCommercialGuidelineSearchTool(): CommercialGuidelineSearchTool {
  return new CommercialGuidelineSearchTool();
}
