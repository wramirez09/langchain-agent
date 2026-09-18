/**
 * Output budgets for the MCP surface.
 *
 * A retrieval tool's JSON runs from a few hundred bytes to well over 100 KB
 * (`local_lcd_search` against a populous state, `policy_content_extractor`
 * across three URLs). Over MCP that payload lands directly in a third party's
 * model context, and every client charges for it. The internal agent path is
 * bounded by the prompt; this path needs a real ceiling.
 *
 * The shrink order is deliberate — drop the least decisive field first, and
 * never hand back a string that is not parseable JSON when it started as JSON.
 */

export const MAX_TOOL_TEXT_CHARS = 60_000;

/** The marker a hard truncation leaves behind, so the model knows to narrow. */
function marker(kept: number, total: number): string {
  return `\n\n[truncated: ${total - kept} of ${total} chars omitted — narrow the query]`;
}

function hardTruncate(text: string, max: number): string {
  // Reserve room for the marker itself so the result really is under `max`.
  // `marker(0, …)` is the worst case: the omitted count is largest, so its
  // digits are the most the marker can ever take.
  const reserve = marker(0, text.length).length;
  const keep = Math.max(0, max - reserve);
  return text.slice(0, keep) + marker(keep, text.length);
}

/**
 * Shrink a parsed search result in place: `relatedMatches` is supporting
 * context, `topMatches` is the answer, so the former goes first and the latter
 * is trimmed from the tail rather than emptied.
 */
function shrinkJson(value: unknown, max: number): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  if ("relatedMatches" in obj) {
    delete obj.relatedMatches;
    const out = JSON.stringify(obj);
    if (out.length <= max) return out;
  }

  if (Array.isArray(obj.topMatches)) {
    const matches = obj.topMatches as unknown[];
    for (let keep = matches.length - 1; keep >= 1; keep--) {
      obj.topMatches = matches.slice(0, keep);
      obj.truncatedMatches = matches.length - keep;
      const out = JSON.stringify(obj);
      if (out.length <= max) return out;
    }
  }

  return null;
}

/**
 * Cap a tool's text payload at `max` characters.
 *
 * Passthrough under the cap. Over it, JSON is shrunk field-wise and stays
 * valid JSON; anything else (or JSON that will not shrink far enough) is hard
 * truncated with an explicit marker.
 */
export function truncateForClient(
  text: string,
  max: number = MAX_TOOL_TEXT_CHARS,
): string {
  if (text.length <= max) return text;

  try {
    const shrunk = shrinkJson(JSON.parse(text), max);
    if (shrunk !== null) return shrunk;
  } catch {
    // Not JSON — fall through to the hard cap.
  }

  return hardTruncate(text, max);
}

/**
 * Flatten the one irregular tool shape on this surface.
 *
 * `policy_content_extractor` returns a single JSON object for one URL but an
 * array of JSON *strings* for two or three (`JSON.stringify(results)` over
 * already-serialized members). Doubly-encoded members are a trap for any
 * client that parses the payload, so re-parse them into one JSON array.
 */
export function normalizeToolText(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  if (!Array.isArray(parsed) || !parsed.every((m) => typeof m === "string")) {
    return raw;
  }

  const members = (parsed as string[]).map((m) => {
    try {
      return JSON.parse(m) as unknown;
    } catch {
      return m;
    }
  });
  return JSON.stringify(members);
}
