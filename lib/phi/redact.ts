/**
 * Apply every rule and produce the de-identified text.
 *
 * The whole design rests on one decision: rules do not rewrite the string,
 * they report spans against the ORIGINAL normalized text. That means all
 * offsets live in a single coordinate system, so overlaps can be resolved
 * globally and the replacements applied in one left-to-right pass.
 *
 * The obvious alternative -- run each rule over the output of the last -- is
 * what you write first and it is subtly wrong: every replacement shifts the
 * offsets of everything after it, so the preview cannot highlight what was
 * removed, and a later rule ends up matching against placeholder text a
 * previous rule inserted (`[MRN]` contains letters; `[DATE]` contains none of
 * the digits the date rule was looking for). Here, no rule ever sees another
 * rule's output.
 */

import type {
  PhiCategory,
  PhiRule,
  PhiSpan,
  RawSpan,
  RedactionResult,
} from "./types";
import { GIVEN_NAMES, SURNAMES } from "./gazetteer";
import { findSuspectNames } from "./names";
import { RULES } from "./rules";

const DEFAULT_PLACEHOLDERS: Record<PhiCategory, string> = {
  name: "[NAME]",
  date: "[DATE]",
  age90: "[AGE 90+]",
  phone: "[PHONE]",
  email: "[EMAIL]",
  ssn: "[SSN]",
  mrn: "[MRN]",
  account: "[ID]",
  address: "[ADDRESS]",
  geo: "[GEO]",
  zip: "[ZIP]",
  facility: "[FACILITY]",
  url: "[URL]",
  ip: "[IP]",
  device: "[DEVICE]",
};

export function placeholderFor(category: PhiCategory): string {
  return DEFAULT_PLACEHOLDERS[category] ?? "[REDACTED]";
}

/**
 * Manually-added spans (the preview's select-to-redact) carry this id. It is
 * given the top priority so a human override always wins over a rule.
 */
export const MANUAL_RULE_ID = "manual";
const MANUAL_PRIORITY = 1000;

/**
 * Resolve overlaps. Highest priority wins; ties go to the longer span, then to
 * the earlier one. A label-anchored `[MRN]` therefore beats the generic
 * digit-run rule over the same characters, and "Austin, TX 78701" stays one
 * `[GEO]` rather than a GEO and a ZIP fighting over the last five digits.
 */
function resolveOverlaps(
  spans: RawSpan[],
  priorityOf: (ruleId: string) => number,
): RawSpan[] {
  const ranked = [...spans].sort((a, b) => {
    const pa = priorityOf(a.ruleId);
    const pb = priorityOf(b.ruleId);
    if (pa !== pb) return pb - pa;
    const la = a.end - a.start;
    const lb = b.end - b.start;
    if (la !== lb) return lb - la;
    return a.start - b.start;
  });

  const kept: RawSpan[] = [];
  for (const span of ranked) {
    if (span.end <= span.start) continue;
    const clashes = kept.some((k) => span.start < k.end && k.start < span.end);
    if (!clashes) kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * De-identify `text`, which must already have been through
 * `normalizeNoteText` -- the returned spans are offsets into that string.
 *
 * `rules` is injectable so tests can exercise one rule in isolation, and
 * `extraSpans` carries the preview's manual select-to-redact additions.
 */
export function redactPhi(
  text: string,
  rules: PhiRule[] = RULES,
  extraSpans: RawSpan[] = [],
): RedactionResult {
  const priority = new Map(rules.map((r) => [r.id, r.priority]));
  const placeholders = new Map(rules.map((r) => [r.id, r.placeholder]));
  const priorityOf = (ruleId: string) =>
    ruleId === MANUAL_RULE_ID ? MANUAL_PRIORITY : (priority.get(ruleId) ?? 0);

  const raw: RawSpan[] = [...extraSpans];
  for (const rule of rules) {
    try {
      raw.push(...rule.find(text));
    } catch {
      // A malformed rule must not take the whole redaction down. Failing open
      // here would mean shipping the raw note, so we drop the one rule, keep
      // the rest, and let the residue gate have the final say.
    }
  }

  const resolved = resolveOverlaps(raw, priorityOf);

  const spans: PhiSpan[] = [];
  const counts: Partial<Record<PhiCategory, number>> = {};
  let out = "";
  let cursor = 0;

  for (const span of resolved) {
    const placeholder =
      placeholders.get(span.ruleId) ?? placeholderFor(span.category);
    out += text.slice(cursor, span.start) + placeholder;
    cursor = span.end;
    spans.push({
      ...span,
      placeholder,
      original: text.slice(span.start, span.end),
    });
    counts[span.category] = (counts[span.category] ?? 0) + 1;
  }
  out += text.slice(cursor);

  return { redacted: out, spans, counts, total: spans.length };
}

/**
 * Stricter variant for surfaces that DISPLAY user-typed text back: the
 * "Your request" card, and the fields of a report that echo the request.
 *
 * `redactPhi` leaves an unanchored capitalised token alone and soft-flags it,
 * because on the way to the model a wrongly removed "Parkinson" changes the
 * determination. On a display surface that trade inverts -- a false positive
 * costs one word on screen, a false negative shows a patient's name -- so the
 * soft flags are redacted too -- but only the ones that look like a person:
 * a gazetteer first name or surname, or any word directly after a first name.
 * A flagged word in neither list is left alone, which is what keeps Title
 * Case procedure names ("Magnetic Resonance Imaging", "MRI Lumbar") intact.
 * Never use this on text bound for the model or on guideline-derived text,
 * where those capitalised words are grading scales and eponyms.
 */
export function redactPhiForDisplay(text: string): RedactionResult {
  const first = redactPhi(text);
  const spans: RawSpan[] = [];
  for (const f of findSuspectNames(text, first.spans)) {
    // "Wayne Rooney": the flag lands on "Rooney" only, because a
    // sentence-initial word is never flagged. A capitalised given name
    // directly before a flagged word makes both of them one name.
    const before = /([A-Z][a-z]+)[ \t]+$/.exec(text.slice(0, f.start));
    const afterGiven = !!before && GIVEN_NAMES.has(before[1].toLowerCase());
    if (!afterGiven && !isGazetteerName(f.text)) continue;
    spans.push({
      start: afterGiven ? f.start - before![0].length : f.start,
      end: f.end,
      category: "name",
      ruleId: "name-suspect",
    });
  }
  return spans.length ? redactPhi(text, RULES, spans) : first;
}

function isGazetteerName(token: string): boolean {
  return token
    .toLowerCase()
    .split("-")
    .some((p) => GIVEN_NAMES.has(p) || SURNAMES.has(p));
}

/**
 * The one-line receipt shown to the user and recorded on the query, e.g.
 * "14 identifiers removed from an uploaded note". Counts only -- it must never
 * name what was removed.
 */
export function redactionReceipt(
  result: RedactionResult,
  source = "an uploaded note",
): string {
  const n = result.total;
  const noun = n === 1 ? "identifier" : "identifiers";
  return `${n} ${noun} removed from ${source}`;
}
