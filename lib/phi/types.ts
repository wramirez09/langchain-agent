/**
 * Types for the de-identification pass that runs BEFORE anything leaves the
 * browser.
 *
 * Context: `documents/privacy-policy.md` disclaims Business Associate status
 * and tells users the Service receives de-identified information only. Until
 * now the only thing backing that was a paragraph in the agent system prompt
 * asking the model to strip PHI — an instruction that travels inside the
 * OpenAI request, i.e. after the raw text has already left. This module is the
 * code that makes the promise true, so it has to run client-side and must not
 * import anything Node-only (`node:crypto`, `Buffer`, `fs`) or DOM-only: the
 * same rules run again server-side as a tripwire.
 */

/**
 * The HIPAA Safe Harbor identifier families we detect, named for what a
 * reviewer would call them rather than for the regex that finds them.
 * `age90` is separate from `date` because ages <= 89 are explicitly PERMITTED
 * under Safe Harbor and are clinically load-bearing for prior auth — only
 * 90-and-over must be generalized.
 */
export type PhiCategory =
  | "name"
  | "date"
  | "age90"
  | "phone"
  | "email"
  | "ssn"
  | "mrn"
  | "account"
  | "address"
  | "geo"
  | "zip"
  | "facility"
  | "url"
  | "ip"
  | "device";

/**
 * A span found by a rule, in the coordinate space of the ORIGINAL normalized
 * text. Every rule matches the same unmodified string and no rule ever sees
 * another rule's output, which is what keeps offsets stable — see `redact.ts`.
 */
export interface RawSpan {
  start: number;
  end: number;
  category: PhiCategory;
  ruleId: string;
}

export interface PhiSpan extends RawSpan {
  /** What the removed text is replaced with, e.g. "[NAME]". */
  placeholder: string;
  /**
   * The text that was removed. Present so the preview can offer an undo and so
   * a rule can be debugged locally. NEVER send this anywhere, log it, or put
   * it in a response body.
   */
  original: string;
}

/** A rule's contribution: find spans, never rewrite the string. */
export interface PhiRule {
  id: string;
  category: PhiCategory;
  placeholder: string;
  /**
   * Priority for overlap resolution — higher wins. Label-anchored rules score
   * above pattern rules so "MRN: 12345" is one `[MRN]` span rather than a
   * partial overlap with the generic digit-run rule.
   */
  priority: number;
  find(text: string): RawSpan[];
}

export interface RedactionResult {
  /** The de-identified text. This is the only thing allowed on the network. */
  redacted: string;
  /** Sorted, non-overlapping, in original-text coordinates. */
  spans: PhiSpan[];
  /** Per-category totals, for the receipt and the confirm-gate summary. */
  counts: Partial<Record<PhiCategory, number>>;
  /** Total spans removed — what the user sees as "N identifiers removed". */
  total: number;
}

/**
 * A capitalized token that MIGHT be a person's name but that no anchored rule
 * could confirm. Deliberately NOT redacted.
 *
 * The tempting design is a gazetteer sweep that redacts any word matching a
 * census surname list. It cannot be tuned: prior-auth determinations turn on
 * eponymous proper nouns -- Kellgren-Lawrence grade, Pfirrmann grade, Meyerding
 * slip, Goutallier stage -- and a list that catches "Nguyen" also catches
 * those. Redacting them produces a confidently wrong determination, which is a
 * worse outcome than the one we are trying to avoid.
 *
 * So these surface in the preview as a highlight the reviewer taps to redact.
 * Recall for unanchored names is a human with the text in front of them, not a
 * regex; the confirm checkbox is what makes that a real control.
 */
export interface SoftFlag {
  start: number;
  end: number;
  text: string;
  reason: "suspect-name" | "occupation" | "employer";
}

/**
 * Something that still looks like an identifier AFTER redaction. High-confidence
 * findings block the confirm button in the UI and return 422 from the tripwire.
 */
export interface ResidueFinding {
  category: PhiCategory;
  ruleId: string;
  /**
   * Confidence in the finding being real PHI. "high" categories are
   * unambiguous enough to block on; "low" ones (bare names, place names) would
   * false-positive on ordinary clinical prose and are reported only.
   */
  confidence: "high" | "low";
  /** Offset in the redacted text, so the UI can point at it. */
  start: number;
  end: number;
}
