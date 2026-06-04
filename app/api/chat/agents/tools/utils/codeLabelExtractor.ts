// Extracts `code → short label/description` pairs from commercial guideline /
// policy document text. The source docs print codes alongside their descriptor
// (e.g. "63045 - Laminectomy, cervical, single segment" or
// "**Breast MRI:** 77046, 77047"), so we harvest the payer's own wording at
// ingestion time. This avoids (a) bundling AMA-copyrighted CPT text and
// (b) relying on the model to invent descriptions.
//
// Pure functions only — no fs / module-scope state — so they're unit-testable.

// CPT Cat I (5 digits), Cat III (4 digits + letter, e.g. 0275T), or HCPCS
// Level II (letter + 4 digits).
const CPT_HCPCS = String.raw`\d{4}[\dA-Z]|[A-V]\d{4}`
// ICD-10-CM: letter, digit, digit/A/B, optional ".subcodes".
const ICD10 = String.raw`[A-TV-Z]\d[\dAB](?:\.[\dA-TV-Z]{1,4})?`
// A standalone code token, optional add-on "+" prefix. ICD tried first so a
// letter-led token isn't misread as HCPCS.
const CODE_SRC = `\\+?(?:${ICD10}|${CPT_HCPCS})`

const CODE_ANYWHERE = new RegExp(CODE_SRC, 'g')
// Inline "CODE [sep] description" at the start of a line. Separator may be a
// dash, colon, or just whitespace; description must start with a letter (so a
// bare comma-separated code list isn't captured as a description).
const INLINE_RE = new RegExp(
  `^(${CODE_SRC})[\\s)\\]]*[—–:-]?\\s+([A-Za-z].{2,159}?)\\s*$`,
)
// "Label: code, code, +code" — the label describes every code in the list.
const GROUP_RE = /^(.{3,80}?):\s*((?:[+]?[A-Z0-9.]{3,7}[,\s]*){1,})$/

// Normalize a code for use as a stable map key: drop a leading "+", trim
// trailing punctuation (e.g. "M48.02-" → "M48.02"), uppercase.
export function normalizeCode(code: string): string {
  return code
    .trim()
    .replace(/^\+/, '')
    .replace(/[^0-9A-Za-z.]+$/, '')
    .toUpperCase()
}

// Strip leading markdown noise (bullets, blockquotes, bold, backslash escapes).
function stripMarkdown(line: string): string {
  return line
    .replace(/^[\s>]*/, '')
    .replace(/\*\*/g, '') // strip bold first so a leading "**" isn't read as a bullet
    .replace(/^(?:[-*•●◦▪‣∙·]|\\-|\d+\.)\s*/, '')
    .replace(/\\([-.])/g, '$1')
    .trim()
}

// Clean a captured description: strip bold markers, collapse whitespace, drop
// trailing punctuation, cap length.
function cleanLabel(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^[-*•●◦▪‣∙·\s]+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[;,.\s]+$/, '')
    .trim()
    .slice(0, 160)
}

// A "code list" value is only codes, commas, plus and spaces — used to confirm
// a GROUP_RE right-hand side really is a list of codes (not prose).
function isCodeList(value: string): boolean {
  const tokens = value.split(/[,\s]+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((t) => new RegExp(`^${CODE_SRC}$`).test(t))
}

/**
 * Extract `code → label` pairs from one document's body text.
 * Later, stronger matches win (see merge rules in mergeCodeLabels).
 */
export function extractCodeLabels(text: string): Map<string, string> {
  const out = new Map<string, string>()
  if (!text) return out

  // The most recent group label, carried onto immediately following bare
  // code-list lines so a list that wraps across lines (label: a, b,\n c, d)
  // labels every code, not just those on the label's own line.
  let carry: string | null = null

  for (const raw of text.split('\n')) {
    const line = stripMarkdown(raw)
    if (!line) {
      carry = null
      continue
    }

    // 1) Inline "CODE — description"
    const inline = line.match(INLINE_RE)
    if (inline) {
      const label = cleanLabel(inline[2])
      // Reject when the "description" is itself just more codes.
      if (label && !isCodeList(label) && /[A-Za-z]{3,}/.test(label)) {
        addLabel(out, inline[1], label)
        carry = null
        continue
      }
    }

    // 2) "Label: code, code, ..." — apply the label to each listed code.
    const group = line.match(GROUP_RE)
    if (group && isCodeList(group[2])) {
      const label = cleanLabel(group[1])
      // Skip ultra-generic single tokens like "CT" (< 3 chars of letters).
      if (label && (label.match(/[A-Za-z]/g)?.length ?? 0) >= 3) {
        for (const m of group[2].matchAll(CODE_ANYWHERE)) addLabel(out, m[0], label)
        carry = label
        continue
      }
    }

    // 3) Bare code-list continuation — inherit the carried group label.
    if (carry && isCodeList(line)) {
      for (const m of line.matchAll(CODE_ANYWHERE)) addLabel(out, m[0], carry)
      continue
    }

    carry = null
  }

  return out
}

// Prefer the most informative label for a code (longest within reason).
function addLabel(map: Map<string, string>, rawCode: string, label: string) {
  const code = normalizeCode(rawCode)
  if (!code) return
  const existing = map.get(code)
  if (!existing || label.length > existing.length) map.set(code, label)
}

/** Merge per-document maps into one, keeping the most informative label. */
export function mergeCodeLabels(
  maps: Iterable<Map<string, string>>,
): Map<string, string> {
  const merged = new Map<string, string>()
  for (const m of maps) {
    for (const [code, label] of m) addLabel(merged, code, label)
  }
  return merged
}
