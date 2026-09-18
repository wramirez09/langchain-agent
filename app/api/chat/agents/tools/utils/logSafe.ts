/**
 * Redaction for search-tool logs.
 *
 * The free-text fields on a search input — `query`, `treatment`, `diagnosis` —
 * are whatever the caller typed. On the first-party web path that is a provider
 * filling in a form; on the public API and the MCP surface it is third-party
 * input that may carry PHI, and these tools used to echo it verbatim into
 * Vercel logs, which are retained and searchable.
 *
 * So the structural fields stay (they are what makes a log line useful when a
 * search misbehaves: which state, how many results, which payer) and the free
 * text is reduced to its length. Codes stay too: a bare CPT or ICD-10 code
 * identifies a procedure, not a person, and they are the fields most worth
 * seeing when scoring looks wrong.
 */

type Redactable = Record<string, unknown>;

/** Fields that hold caller-supplied prose. */
const FREE_TEXT = ["query", "treatment", "diagnosis"] as const;

function redactValue(v: unknown): string {
  if (typeof v !== "string") return "<redacted>";
  return `<redacted:${v.length} chars>`;
}

/**
 * A copy of `input` safe to log: free-text fields replaced by their length,
 * everything else untouched.
 */
export function logSafeInput<T extends Redactable>(input: T): Redactable {
  const out: Redactable = { ...input };
  for (const field of FREE_TEXT) {
    if (out[field] !== undefined) out[field] = redactValue(out[field]);
  }
  return out;
}

/** The same redaction for a single free-text value logged on its own. */
export function logSafeText(value: unknown): string {
  return redactValue(value);
}
