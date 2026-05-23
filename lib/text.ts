// Shared text normalization + tokenization used by the Medicare hybrid
// scorer and the BM25 helper. Kept tiny and dependency-free so it can run
// at request time without GC pressure.

export function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// English-only minimal stoplist. Clinical queries are short, so removing
// common words materially improves BM25 IDF without dropping signal.
const STOP = new Set([
  "the", "and", "for", "with", "from", "into", "this", "that", "than",
  "but", "are", "was", "were", "has", "had", "have", "you", "your",
  "not", "any", "all", "use", "used", "per", "via", "between",
]);

export function tokenize(str: string): string[] {
  const toks = normalizeText(str).split(/\s+/).filter((t) => t.length > 2);
  return toks.filter((t) => !STOP.has(t));
}

export function sha256Hex(input: string): string {
  // Lazy require so this file stays valid in any runtime that imports it
  // for tokenize alone (e.g. tests).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(input).digest("hex");
}
