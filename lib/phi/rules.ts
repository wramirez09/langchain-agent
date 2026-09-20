/**
 * The detection rules.
 *
 * Two invariants hold for everything in this file:
 *
 * 1. A rule NEVER rewrites the string. It reports spans in the coordinate
 *    space of the original normalized text. `redact.ts` resolves overlaps by
 *    priority and applies every replacement in one pass, which is what keeps
 *    offsets stable and lets the preview highlight exact ranges.
 *
 * 2. No lookbehind and no `d` (hasIndices) flag. This module runs in the
 *    browser on mobile Safari, where both are recent additions. Where a rule
 *    needs to anchor on preceding context it captures that context as group 1
 *    and the value as group 2, and the span is computed arithmetically.
 *
 * Pattern order is expressed through `priority`, not through file order:
 * label-anchored rules outrank pattern rules so "MRN: 4429301" is a single
 * `[MRN]` span rather than a partial overlap with the generic digit-run rule.
 */

import type { PhiCategory, PhiRule, RawSpan } from "./types";
import { NAME_RULES } from "./names";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Span covering the whole match. */
function scanWhole(
  text: string,
  re: RegExp,
  category: PhiCategory,
  ruleId: string,
): RawSpan[] {
  const out: RawSpan[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined || !m[0]) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      category,
      ruleId,
    });
  }
  return out;
}

/**
 * Span covering group 2 only, with group 1 as the anchor that precedes it.
 * Exact because the two groups are adjacent by construction.
 */
function scanAnchored(
  text: string,
  re: RegExp,
  category: PhiCategory,
  ruleId: string,
): RawSpan[] {
  const out: RawSpan[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    const prefix = m[1] ?? "";
    const value = m[2] ?? "";
    if (!value.trim()) continue;
    const start = m.index + prefix.length;
    out.push({ start, end: start + value.length, category, ruleId });
  }
  return out;
}

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const MONTHS =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t)?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

/* ------------------------------------------------------------------ */
/* label-anchored rules (highest precision)                            */
/* ------------------------------------------------------------------ */

/**
 * Every label we recognize, in one alternation. Used twice: to start a match,
 * and as the lookahead that stops a value running past the NEXT label on the
 * same line -- clinical notes put the whole demographics banner on one row.
 * Note the lookahead uses `\\s+`, not `\\s{2,}`: `normalizeNoteText` has already
 * collapsed the run of spaces a banner uses for column alignment down to one,
 * ("Patient: Jane Doe   DOB: 01/02/1970   MRN: 4429301").
 */
const LABEL_GROUPS: Array<{
  id: string;
  category: PhiCategory;
  placeholder: string;
  words: string[];
}> = [
  {
    id: "label-name",
    category: "name",
    placeholder: "[NAME]",
    words: [
      "Patient Name",
      "Patient",
      "Pt Name",
      "Pt",
      "Name",
      "Provider",
      "Attending(?: Physician)?",
      "Referring(?: Physician| Provider)?",
      "Physician",
      "Surgeon",
      "Ordering(?: Physician| Provider)?",
      "PCP",
      "Guarantor",
      "Emergency Contact",
      "Next of Kin",
      "Dictated by",
      "Transcribed by",
      "Signed by",
      "Electronically signed by",
      "cc",
    ],
  },
  {
    id: "label-dob",
    category: "date",
    placeholder: "[DOB]",
    words: ["DOB", "D\\.O\\.B\\.?", "Date of Birth", "Birth Date", "Birthdate"],
  },
  {
    id: "label-mrn",
    category: "mrn",
    placeholder: "[MRN]",
    words: [
      "MRN",
      "M\\.R\\.N\\.?",
      "Medical Record(?: Number| No\\.?| #)?",
      "Chart(?: Number| No\\.?| #)?",
      "Patient ID",
    ],
  },
  {
    id: "label-ssn",
    category: "ssn",
    placeholder: "[SSN]",
    words: ["SSN", "S\\.S\\.N\\.?", "Social Security(?: Number| No\\.?| #)?"],
  },
  {
    id: "label-account",
    category: "account",
    placeholder: "[ID]",
    words: [
      "Acct(?: Number| No\\.?| #)?",
      "Account(?: Number| No\\.?| #)?",
      "Policy(?: Number| No\\.?| #)?",
      "Group(?: Number| No\\.?| #)",
      "Member(?: ID| Number| No\\.?| #)?",
      "Subscriber(?: ID| Number)?",
      "Claim(?: Number| No\\.?| #)",
      "Auth(?:orization)?(?: Number| No\\.?| #)",
      "Case(?: Number| No\\.?| #)",
      "NPI",
      "DEA",
      "License(?: Number| No\\.?| #)?",
      "Serial(?: Number| No\\.?| #)?",
      "Device ID",
    ],
  },
  {
    id: "label-phone",
    category: "phone",
    placeholder: "[PHONE]",
    words: [
      "Phone",
      "Telephone",
      "Tel",
      "Mobile",
      "Cell",
      "Home Phone",
      "Work Phone",
      "Fax",
    ],
  },
  {
    id: "label-email",
    category: "email",
    placeholder: "[EMAIL]",
    words: ["Email", "E-mail", "E mail"],
  },
  {
    id: "label-address",
    category: "address",
    placeholder: "[ADDRESS]",
    words: ["Address", "Street", "Home Address", "Mailing Address", "City"],
  },
];

const ALL_LABEL_WORDS = LABEL_GROUPS.flatMap((g) => g.words).join("|");

/**
 * Value runs to end of line, or to the next label on the same line, whichever
 * comes first. The `[^\n]*?` is lazy and the lookahead is anchored, so there is
 * no nested quantifier and no backtracking blowup.
 */
function labelRule(group: (typeof LABEL_GROUPS)[number]): PhiRule {
  const re = new RegExp(
    "(\\b(?:" +
      group.words.join("|") +
      ")\\s*[:#]\\s*)" +
      "([^\\n]*?)" +
      "(?=\\s+\\b(?:" +
      ALL_LABEL_WORDS +
      ")\\s*[:#]|\\s*$)",
    "gim",
  );
  return {
    id: group.id,
    category: group.category,
    placeholder: group.placeholder,
    priority: 100,
    find: (text) => scanAnchored(text, re, group.category, group.id),
  };
}

/* ------------------------------------------------------------------ */
/* pattern rules                                                       */
/* ------------------------------------------------------------------ */

const PATTERN_RULES: PhiRule[] = [
  {
    id: "email",
    category: "email",
    placeholder: "[EMAIL]",
    priority: 90,
    find: (t) =>
      scanWhole(
        t,
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
        "email",
        "email",
      ),
  },
  {
    id: "url",
    category: "url",
    placeholder: "[URL]",
    priority: 90,
    find: (t) =>
      scanWhole(t, /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi, "url", "url"),
  },
  {
    id: "ip",
    category: "ip",
    placeholder: "[IP]",
    priority: 90,
    find: (t) => scanWhole(t, /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "ip", "ip"),
  },
  {
    id: "ssn",
    category: "ssn",
    placeholder: "[SSN]",
    priority: 88,
    find: (t) => scanWhole(t, /\b\d{3}-\d{2}-\d{4}\b/g, "ssn", "ssn"),
  },
  {
    // Parenthesized, dotted, dashed or spaced, with an optional extension.
    id: "phone",
    category: "phone",
    placeholder: "[PHONE]",
    priority: 86,
    find: (t) =>
      scanWhole(
        t,
        /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?/gi,
        "phone",
        "phone",
      ),
  },
  {
    // Numeric dates. A bare 4-digit year is deliberately NOT matched --
    // Safe Harbor permits the year, and durations depend on it.
    id: "date-numeric",
    category: "date",
    placeholder: "[DATE]",
    priority: 80,
    find: (t) =>
      scanWhole(
        t,
        /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
        "date",
        "date-numeric",
      ),
  },
  {
    id: "date-day-month",
    category: "date",
    placeholder: "[DATE]",
    priority: 80,
    find: (t) =>
      scanWhole(
        t,
        new RegExp(
          "\\b\\d{1,2}[-\\s](?:" + MONTHS + ")\\.?[-,\\s]*\\d{2,4}\\b",
          "gi",
        ),
        "date",
        "date-day-month",
      ),
  },
  {
    id: "date-month-day",
    category: "date",
    placeholder: "[DATE]",
    priority: 80,
    find: (t) =>
      scanWhole(
        t,
        new RegExp(
          "\\b(?:" +
            MONTHS +
            ")\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{4})?\\b",
          "gi",
        ),
        "date",
        "date-month-day",
      ),
  },
  {
    // Safe Harbor: ages 90 and over must be generalized. 89 and under stay --
    // they are permitted and prior-auth criteria are frequently age-banded.
    id: "age-90-plus",
    category: "age90",
    placeholder: "[AGE 90+]",
    priority: 78,
    find: (t) =>
      scanWhole(
        t,
        /\b(?:9\d|1[0-2]\d)\s*-?\s*(?:y\/?o\b|yo\b|yrs?\.?\s*old\b|years?\s*-?\s*old\b)/gi,
        "age90",
        "age-90-plus",
      ),
  },
  {
    // "Austin, TX 78701" -- consumes the ZIP so the ZIP rule cannot see it.
    id: "city-state-zip",
    category: "geo",
    placeholder: "[GEO]",
    priority: 70,
    find: (t) =>
      scanWhole(
        t,
        new RegExp(
          "\\b[A-Z][A-Za-z.'-]+(?:\\s[A-Z][A-Za-z.'-]+){0,3},\\s*(?:" +
            US_STATES +
            ")\\s+\\d{5}(?:-\\d{4})?\\b",
          "g",
        ),
        "geo",
        "city-state-zip",
      ),
  },
  {
    id: "street-address",
    category: "address",
    placeholder: "[ADDRESS]",
    priority: 70,
    find: (t) =>
      scanWhole(
        t,
        /\b\d{1,6}\s+[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,4}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Court|Ct|Circle|Cir|Way|Place|Pl|Terrace|Ter|Parkway|Pkwy|Highway|Hwy)\b\.?(?:\s*(?:#|Suite|Ste|Apt|Unit)\s*[\w-]+)?/g,
        "address",
        "street-address",
      ),
  },
  {
    // Only with an explicit ZIP label; a bare 5-digit number is far more
    // likely to be a CPT code in this corpus.
    id: "zip-labeled",
    category: "zip",
    placeholder: "[ZIP]",
    priority: 68,
    find: (t) =>
      scanAnchored(
        t,
        /((?:ZIP|Zip Code|Postal Code)\s*:?\s*)(\d{5}(?:-\d{4})?)\b/gi,
        "zip",
        "zip-labeled",
      ),
  },
  {
    id: "facility",
    category: "facility",
    placeholder: "[FACILITY]",
    priority: 60,
    find: (t) =>
      scanWhole(
        t,
        /\b[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,4}\s+(?:Hospital|Clinic|Medical Center|Medical Centre|Health System|Healthcare|Health Center|Surgery Center|Surgical Center|Infirmary|Sanatorium)\b/g,
        "facility",
        "facility",
      ),
  },
  {
    // Long identifier runs: MRNs, NPIs, account and policy numbers that were
    // written without a label. Six digits minimum so a 5-digit CPT code and a
    // 4-digit year are both out of range.
    id: "id-digit-run",
    category: "mrn",
    placeholder: "[ID]",
    priority: 30,
    find: (t) =>
      scanWhole(t, /\b[A-Z]{0,3}[-]?\d{6,14}\b/g, "mrn", "id-digit-run"),
  },
];

export const RULES: PhiRule[] = [
  ...LABEL_GROUPS.map(labelRule),
  ...NAME_RULES,
  ...PATTERN_RULES,
];

/** Exposed so `detect.ts` can reuse the same patterns for the tripwire. */
export const RULES_BY_ID: Record<string, PhiRule> = Object.fromEntries(
  RULES.map((r) => [r.id, r]),
);
