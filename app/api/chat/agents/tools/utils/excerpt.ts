/**
 * Query-relevant excerpting for retrieved guideline bodies.
 *
 * The search RPC hands back the whole document. Handing the whole thing to the
 * agent is not affordable (bodies run 5KB–200KB, and five of them share one
 * context), but the previous alternative — `left(body, 500)` — was worse: for
 * most documents the first 500 characters are a definition or a boilerplate
 * "GENERAL DOCUMENTATION REQUIREMENTS" preamble, so the criteria that carry the
 * payer's actual thresholds ("at least 6 weeks within the last 6 months",
 * "10-year ASCVD risk 5% to less than 7.5%") never reached the model and it
 * answered from its own recall instead. That is why identical requests returned
 * different thresholds run to run.
 *
 * This picks the passages that mention the query's terms, keeps the document's
 * opening for context, and stitches them in document order.
 */

/** Words that carry no retrieval signal in a clinical query. */
const STOPWORDS = new Set([
  "and", "are", "for", "from", "the", "this", "that", "with", "was", "were",
  "has", "have", "had", "not", "any", "all", "can", "may", "must", "should",
  "when", "what", "which", "who", "whom", "how", "why", "does", "did", "will",
  "prior", "authorization", "authorisation", "criteria", "criterion", "medical",
  "necessity", "guideline", "guidelines", "commercial", "policy", "policies",
  "request", "requested", "requirements", "coverage", "patient", "please",
]);

/**
 * Distinct, meaningful lowercase terms in a query. Codes keep their dot
 * ("m54.12"), so an ICD-10 in the query still matches the guideline's code
 * lists.
 */
export function queryTerms(query: string): string[] {
  const terms = (query || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\-\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return Array.from(new Set(terms));
}

/**
 * Ceiling on a scoring unit. Several corpus documents came through a PDF
 * converter and carry long runs with no blank lines; without this, one such run
 * is a single block and relevance selection degenerates to "take the head".
 */
const MAX_BLOCK_CHARS = 2500;

/** Break an oversized block on the last line break, else the last sentence. */
function splitOversized(block: string): string[] {
  if (block.length <= MAX_BLOCK_CHARS) return [block];
  const out: string[] = [];
  let rest = block;
  while (rest.length > MAX_BLOCK_CHARS) {
    const window = rest.slice(0, MAX_BLOCK_CHARS);
    let cut = window.lastIndexOf("\n");
    if (cut < MAX_BLOCK_CHARS / 2) cut = window.lastIndexOf(". ");
    cut = cut < MAX_BLOCK_CHARS / 2 ? MAX_BLOCK_CHARS : cut + 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.trim().length > 0) out.push(rest);
  return out;
}

/**
 * Split a body into blocks on blank lines, folding short blocks (headings,
 * single-line labels) into the block that follows so a heading is never scored
 * or emitted apart from the text it introduces, then capping block size.
 */
function toBlocks(body: string): string[] {
  const raw = body.split(/\n{2,}/);
  const blocks: string[] = [];
  let pending = "";

  for (const part of raw) {
    const candidate = pending ? `${pending}\n\n${part}` : part;
    if (candidate.trim().length < 200) {
      pending = candidate;
      continue;
    }
    blocks.push(candidate);
    pending = "";
  }
  if (pending.trim().length > 0) blocks.push(pending);
  return (blocks.length > 0 ? blocks : [body]).flatMap(splitOversized);
}

/** Distinct query terms appearing in a block; the score is that count. */
function scoreBlock(block: string, terms: string[]): number {
  const haystack = block.toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if (haystack.includes(term)) hits++;
  }
  return hits;
}

/**
 * Pick up to `maxChars` of the passages most relevant to `query`.
 *
 * The document opening is always kept (up to a quarter of the budget) because
 * it names the procedure and its scope; the rest of the budget goes to the
 * highest-scoring blocks, emitted in document order with an ellipsis marking
 * each gap so the agent can tell the text is not contiguous.
 *
 * Returns the whole body when it already fits.
 */
export function selectRelevantExcerpt(
  body: string,
  query: string,
  maxChars: number,
): string {
  const text = (body ?? "").trim();
  if (!text) return "";
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;

  const terms = queryTerms(query);
  const blocks = toBlocks(text);

  // A single opening block larger than the whole budget is all we can show.
  if (blocks[0].length > maxChars) {
    return `${text.slice(0, maxChars).trimEnd()}…`;
  }

  // Separators are part of the output, so they count against the budget: two
  // newlines between adjacent blocks, seven more when a gap marker goes in.
  const JOIN_COST = "\n\n[…]\n\n".length;
  const chosen = new Set<number>([0]);
  let used = blocks[0].length;

  // Extend the opening while it stays cheap — it names the procedure and its
  // scope — but cap it so a long preamble can't eat the budget.
  const headBudget = Math.floor(maxChars / 4);
  for (let i = 1; i < blocks.length; i++) {
    const len = blocks[i].length + JOIN_COST;
    if (used + len > headBudget) break;
    chosen.add(i);
    used += len;
  }

  const ranked = blocks
    .map((block, index) => ({ index, score: scoreBlock(block, terms) }))
    .filter((b) => b.score > 0 && !chosen.has(b.index))
    // Highest scoring first; ties keep document order so earlier (usually more
    // general) criteria win over late appendix mentions.
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const { index } of ranked) {
    const len = blocks[index].length + JOIN_COST;
    if (used + len > maxChars) continue;
    chosen.add(index);
    used += len;
  }

  const indices = Array.from(chosen).sort((a, b) => a - b);
  let out = "";
  let previous = -1;
  for (const index of indices) {
    if (previous !== -1 && index !== previous + 1) out += "\n\n[…]\n\n";
    else if (previous !== -1) out += "\n\n";
    out += blocks[index].trim();
    previous = index;
  }
  // Trimming blocks can only shrink the result, but cap defensively so the
  // caller's budget is a guarantee rather than an estimate.
  return out.length > maxChars ? `${out.slice(0, maxChars).trimEnd()}…` : out;
}
