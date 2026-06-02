/**
 * Tolerant best-effort JSON parser for STREAMING partial JSON.
 *
 * The agent streams its artifact as a JSON string that grows token-by-token,
 * so at any instant the text may be truncated mid-string, mid-array, or
 * mid-object. This returns the most complete object parseable so far (or null),
 * letting the client render sections as they arrive.
 *
 * Strategy: fast-path `JSON.parse`; otherwise balance open strings/brackets and
 * tidy trailing tokens; if that still fails, drop the trailing partial element
 * and retry a few times.
 */
export function parsePartialJson<T = unknown>(input: string): T | null {
  if (!input) return null;
  let s = stripToJson(input);
  if (!s) return null;

  const direct = tryParse<T>(s);
  if (direct !== undefined) return direct;

  for (let attempt = 0; attempt < 8; attempt++) {
    const parsed = tryParse<T>(closeJson(s));
    if (parsed !== undefined) return parsed;
    const truncated = truncateToLastBoundary(s);
    if (truncated === null || truncated.length === 0) break;
    s = truncated;
  }
  return null;
}

/** Strip optional ```json fences and slice to the first `{`. */
function stripToJson(input: string): string {
  let s = input.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  const i = s.indexOf("{");
  return i === -1 ? "" : s.slice(i).trim();
}

function tryParse<T>(s: string): T | undefined {
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
}

/** Balance strings/brackets and tidy trailing tokens into a closeable string. */
function closeJson(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let out = s;
  if (inStr) out += '"'; // close a dangling string
  out = out.replace(/\s+$/, "");
  if (out.endsWith(",")) out = out.slice(0, -1); // trailing comma
  if (/:\s*$/.test(out)) out += "null"; // key with colon but no value yet

  // Dangling key string with no colon yet, e.g. `{"foo"` or `{"a":1,"foo"` —
  // the trailing quoted token is a key, not a value, so drop it before closing.
  const endsWithQuoted = /"(?:[^"\\]|\\.)*"\s*$/.test(out);
  const endsWithValueString = /:\s*"(?:[^"\\]|\\.)*"\s*$/.test(out);
  if (stack[stack.length - 1] === "}" && endsWithQuoted && !endsWithValueString) {
    out = out.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*$/, "");
    if (out.endsWith(",")) out = out.slice(0, -1);
  }

  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/** Truncate back to the last top-of-string comma/bracket boundary. */
function truncateToLastBoundary(s: string): string | null {
  let inStr = false;
  let esc = false;
  let lastBoundary = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "," || ch === "}" || ch === "]") lastBoundary = i;
  }
  if (lastBoundary <= 0) return null;
  // Drop the partial element after a comma; keep through a closing bracket.
  return s[lastBoundary] === ","
    ? s.slice(0, lastBoundary)
    : s.slice(0, lastBoundary + 1);
}
