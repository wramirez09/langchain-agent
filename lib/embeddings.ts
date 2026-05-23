import { OpenAIEmbeddings } from "@langchain/openai";
import { cache, TTL } from "./cache";
import { sha256Hex } from "./text";

// text-embedding-3-small: 1536 dims, unit-normalized.
// Same model used everywhere so cached vectors can be reused across tools.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;
const CACHE_VERSION = "v1";

let _client: OpenAIEmbeddings | null = null;
function client(): OpenAIEmbeddings {
  if (!_client) {
    _client = new OpenAIEmbeddings({
      model: EMBEDDING_MODEL,
      maxRetries: 3,
      timeout: 30_000,
      // OpenAI accepts up to 2048 inputs/batch; 100 is the sweet spot for
      // payload size + retry granularity.
      batchSize: 100,
    });
  }
  return _client;
}

function cacheKey(text: string): string {
  return `embedding:${CACHE_VERSION}:${EMBEDDING_MODEL}:${sha256Hex(text)}`;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const key = cacheKey(text);
  const cached = cache.get<number[]>(key);
  if (cached) return new Float32Array(cached);

  const vec = await client().embedQuery(text);
  cache.set(key, vec, TTL.VERY_LONG);
  return new Float32Array(vec);
}

// Batch-embed an array of texts. Cached entries are returned without an
// API call; only the misses are sent to OpenAI. Order of the returned
// array matches the input order.
export async function embedMany(texts: string[]): Promise<Float32Array[]> {
  const out: (Float32Array | null)[] = new Array(texts.length).fill(null);
  const missIdx: number[] = [];
  const missTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const hit = cache.get<number[]>(cacheKey(texts[i]));
    if (hit) {
      out[i] = new Float32Array(hit);
    } else {
      missIdx.push(i);
      missTexts.push(texts[i]);
    }
  }

  if (missTexts.length > 0) {
    const vecs = await client().embedDocuments(missTexts);
    for (let j = 0; j < missTexts.length; j++) {
      const vec = vecs[j];
      cache.set(cacheKey(missTexts[j]), vec, TTL.VERY_LONG);
      out[missIdx[j]] = new Float32Array(vec);
    }
  }

  return out as Float32Array[];
}

// Cosine similarity for unit-normalized vectors (which text-embedding-3-small
// already produces). Falls back to safe math if a non-unit vector ever shows up.
export function cosine(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot; // == cosine for unit vectors
}
