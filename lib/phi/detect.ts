/**
 * Post-redaction residue scan. Two callers, one rule set:
 *
 *  - the preview, where a blocking finding keeps the confirm button disabled
 *    until the reviewer removes it by hand;
 *  - `POST /api/notes/extract`, where a blocking finding is a 422.
 *
 * The server case is why this module reports OFFSETS AND CATEGORIES ONLY and
 * never the matched text. A tripwire that echoed what it found would copy the
 * exact PHI it exists to stop into a response body and a server log -- the
 * same mistake `logSafe.ts` was written to fix on the search tools.
 *
 * "high" confidence means the pattern is unambiguous enough to block on.
 * "low" means it would false-positive on ordinary clinical prose, so it is
 * counted and surfaced but never blocks: turning a heuristic into an outage in
 * a healthcare workflow is its own kind of failure.
 */

import type { PhiCategory, ResidueFinding } from "./types";

interface ResidueRule {
  ruleId: string;
  category: PhiCategory;
  confidence: "high" | "low";
  re: RegExp;
}

const RESIDUE_RULES: ResidueRule[] = [
  {
    ruleId: "residue-ssn",
    category: "ssn",
    confidence: "high",
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    ruleId: "residue-email",
    category: "email",
    confidence: "high",
    re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
  },
  {
    ruleId: "residue-phone",
    category: "phone",
    confidence: "high",
    re: /(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  },
  {
    // Nine consecutive digits is an SSN, a member id or an account number.
    // Nothing clinical is nine digits long.
    ruleId: "residue-digit-run",
    category: "account",
    confidence: "high",
    re: /\b\d{9,}\b/g,
  },
  {
    // Digits still sitting next to an identifier label means a label rule
    // missed -- the highest-signal evidence that redaction underperformed.
    ruleId: "residue-labelled-id",
    category: "mrn",
    confidence: "high",
    re: /\b(?:MRN|SSN|Medical Record|Account|Policy|Member ID|Subscriber)\b[^\n]{0,12}?\d{3,}/gi,
  },
  {
    ruleId: "residue-date",
    category: "date",
    confidence: "high",
    re: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  },
  {
    ruleId: "residue-url",
    category: "url",
    confidence: "low",
    re: /\b(?:https?:\/\/|www\.)\S+/gi,
  },
  {
    ruleId: "residue-zip-ish",
    category: "zip",
    confidence: "low",
    // A 5-digit number right after a two-letter state code. Low confidence
    // because a CPT code can follow almost anything.
    re: /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s+\d{5}\b/g,
  },
];

/**
 * Scan already-redacted text. Offsets are into that string, so the preview can
 * point at the problem.
 */
export function detectPhi(redacted: string): ResidueFinding[] {
  const out: ResidueFinding[] = [];
  for (const rule of RESIDUE_RULES) {
    for (const m of redacted.matchAll(rule.re)) {
      if (m.index === undefined || !m[0]) continue;
      out.push({
        category: rule.category,
        ruleId: rule.ruleId,
        confidence: rule.confidence,
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The subset that must stop the request. */
export function blockingFindings(findings: ResidueFinding[]): ResidueFinding[] {
  return findings.filter((f) => f.confidence === "high");
}

/**
 * Counts by category, suitable for a response body or a log line. Contains no
 * text from the note by construction -- this is the only shape of residue
 * information allowed to leave the process.
 */
export function residueSummary(
  findings: ResidueFinding[],
): Partial<Record<PhiCategory, number>> {
  const out: Partial<Record<PhiCategory, number>> = {};
  for (const f of findings) out[f.category] = (out[f.category] ?? 0) + 1;
  return out;
}
