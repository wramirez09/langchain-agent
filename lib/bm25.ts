import { tokenize } from "./text";

// Standard Okapi BM25 over a fixed corpus. Built once per cache fill,
// then queried at request time. ~50 LOC, no dependencies.
//
// Use case here: ranking ~2k CMS document titles against a short
// clinical query. Index build is O(N * avg-title-tokens); query is
// O(qTokens * matchingDocs).

const K1 = 1.5;
const B = 0.75;

export interface BM25Index {
  docTokens: string[][];   // per-doc tokens
  docLens: number[];       // per-doc length
  avgdl: number;           // average doc length
  df: Map<string, number>; // doc frequency per term
  N: number;               // total docs
  // Postings: term -> array of [docId, termFrequency]
  postings: Map<string, Array<[number, number]>>;
}

export function buildBm25Index(docs: string[]): BM25Index {
  const docTokens = docs.map((d) => tokenize(d));
  const docLens = docTokens.map((toks) => toks.length);
  const totalLen = docLens.reduce((a, b) => a + b, 0);
  const avgdl = docLens.length > 0 ? totalLen / docLens.length : 0;

  const df = new Map<string, number>();
  const postings = new Map<string, Array<[number, number]>>();

  for (let d = 0; d < docTokens.length; d++) {
    const tf = new Map<string, number>();
    for (const t of docTokens[d]) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [term, freq] of tf) {
      df.set(term, (df.get(term) ?? 0) + 1);
      let list = postings.get(term);
      if (!list) {
        list = [];
        postings.set(term, list);
      }
      list.push([d, freq]);
    }
  }

  return { docTokens, docLens, avgdl, df, N: docs.length, postings };
}

// Returns a sparse map of {docId -> score}. Only docs that contain at
// least one query term get a score.
export function bm25Score(
  index: BM25Index,
  query: string,
): Map<number, number> {
  const scores = new Map<number, number>();
  const qTokens = Array.from(new Set(tokenize(query)));
  if (qTokens.length === 0) return scores;

  for (const term of qTokens) {
    const list = index.postings.get(term);
    if (!list) continue;
    const dfT = index.df.get(term) ?? 1;
    const idf = Math.log(1 + (index.N - dfT + 0.5) / (dfT + 0.5));
    for (const [docId, tf] of list) {
      const dl = index.docLens[docId] || 1;
      const norm = 1 - B + B * (dl / (index.avgdl || 1));
      const tfPart = (tf * (K1 + 1)) / (tf + K1 * norm);
      scores.set(docId, (scores.get(docId) ?? 0) + idf * tfPart);
    }
  }
  return scores;
}
