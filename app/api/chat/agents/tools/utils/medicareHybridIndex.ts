import { cache, TTL } from "@/lib/cache";
import { BM25Index, buildBm25Index, bm25Score } from "@/lib/bm25";
import { cosine, embedMany, embedQuery, EMBEDDING_DIMS } from "@/lib/embeddings";
import { normalizeText, tokenize } from "@/lib/text";

// CMS list endpoints only return title + display ID per record, so the
// hybrid index is built over that. Body text is fetched separately via
// medicare_policy_detail when the agent needs it.

export interface MedicareDoc {
  // Minimal shape; tools pass through arbitrary extra metadata via the
  // `raw` field so we don't have to mirror every CMS field here.
  id: string;
  title: string;
  displayId?: string;
  raw: Record<string, unknown>;
}

export interface HybridIndex {
  docs: MedicareDoc[];
  bm25: BM25Index;
  embeddings: Float32Array[]; // 1:1 with docs
}

const INDEX_CACHE_VERSION = "v1";

function indexCacheKey(namespace: string): string {
  return `cms-hybrid-index:${INDEX_CACHE_VERSION}:${namespace}`;
}

// Build (or fetch from cache) a hybrid index for the given CMS list.
// `namespace` should be unique per list scope (e.g. "ncd", "lcd:36",
// "lca:36"). TTL matches the raw data cache so both invalidate together.
export async function getOrBuildHybridIndex(
  namespace: string,
  docs: MedicareDoc[],
): Promise<HybridIndex> {
  const key = indexCacheKey(namespace);
  const cached = cache.get<HybridIndex>(key);
  if (cached && cached.docs.length === docs.length) return cached;

  const titles = docs.map((d) => `${d.title} ${d.displayId ?? ""}`.trim());
  const bm25 = buildBm25Index(titles);

  // Embed all titles in one shot (embedMany handles batching + caching).
  const t0 = Date.now();
  const embeddings = await embedMany(titles);
  console.log(
    `[HybridIndex:${namespace}] Embedded ${docs.length} titles in ${Date.now() - t0}ms`,
  );

  const index: HybridIndex = { docs, bm25, embeddings };
  cache.set(key, index, TTL.LONG);
  return index;
}

export interface ScoredHybrid {
  doc: MedicareDoc;
  score: number;
  matchedOn: string[];
}

export interface HybridScoreInput {
  query: string;
  treatment?: string;
  diagnosis?: string;
  cptCodes: string[];
  icd10Codes: string[];
  state?: string; // for LCD/LCA only
  stateName?: string; // for matchedOn label
}

// Unified Medicare scorer. Replaces the per-doc-type weighted heuristics
// in scoreMedicareDocument.ts with a hybrid:
//   score = 6 * cosine(query_emb, title_emb)
//         + 4 * normalized_bm25
//         +10 if normalize(query) == displayId   (exact ID is definitive)
//         + 5 if displayId is substring of query
//         + 2 if state appears in raw.state_description (LCD/LCA only)
//         + 1 per CPT/ICD-10 token whose digits appear in the title
export async function scoreHybrid(
  index: HybridIndex,
  input: HybridScoreInput,
): Promise<ScoredHybrid[]> {
  if (index.docs.length === 0) return [];

  const queryText = [input.query, input.treatment, input.diagnosis]
    .filter(Boolean)
    .join(" ");
  const queryEmb = await embedQuery(queryText);
  const bm25Map = bm25Score(index.bm25, queryText);

  // Normalize BM25 scores to [0,1] for stable blending against cosine.
  let bm25Max = 0;
  for (const s of bm25Map.values()) if (s > bm25Max) bm25Max = s;
  const bm25Norm = bm25Max > 0 ? 1 / bm25Max : 0;

  const queryNorm = normalizeText(input.query);
  const stateNorm = input.stateName ? normalizeText(input.stateName) : "";
  const codeTokens = new Set(
    [...input.cptCodes, ...input.icd10Codes].map((c) => c.toLowerCase()),
  );

  const out: ScoredHybrid[] = [];
  for (let i = 0; i < index.docs.length; i++) {
    const doc = index.docs[i];
    const titleNorm = normalizeText(doc.title);
    const displayId = String(doc.displayId ?? "").toLowerCase();
    const matchedOn: string[] = [];

    let score = 0;

    // Semantic
    if (queryEmb.length === EMBEDDING_DIMS && index.embeddings[i]?.length === EMBEDDING_DIMS) {
      const sem = cosine(queryEmb, index.embeddings[i]);
      if (sem > 0.2) {
        score += 6 * sem;
        matchedOn.push(`sem:${sem.toFixed(2)}`);
      }
    }

    // Lexical (BM25)
    const rawBm = bm25Map.get(i) ?? 0;
    if (rawBm > 0) {
      const lex = rawBm * bm25Norm;
      score += 4 * lex;
      matchedOn.push(`lex:${lex.toFixed(2)}`);
    }

    // Exact display ID (definitive — e.g. user typed "220.3")
    if (displayId.length > 0) {
      if (queryNorm === displayId) {
        score += 10;
        matchedOn.push(`displayId:exact:${displayId}`);
      } else if (queryNorm.includes(displayId) || displayId.includes(queryNorm)) {
        score += 5;
        matchedOn.push(`displayId:partial:${displayId}`);
      }
    }

    // State (LCD/LCA only)
    if (stateNorm) {
      const docState = normalizeText(String(doc.raw.state_description ?? ""));
      if (docState && (docState.includes(stateNorm) || stateNorm.includes(docState))) {
        score += 2;
        matchedOn.push(`state:${doc.raw.state_description}`);
      }
    }

    // Code tokens appearing in the title
    if (codeTokens.size > 0) {
      const titleTokens = new Set(tokenize(doc.title));
      let codeHits = 0;
      for (const c of codeTokens) if (titleTokens.has(c)) codeHits++;
      if (codeHits > 0) {
        score += codeHits;
        matchedOn.push(`codes:${codeHits}`);
      }
    }

    if (score > 0) out.push({ doc, score, matchedOn });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}
