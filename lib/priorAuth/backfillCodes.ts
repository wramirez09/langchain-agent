import type {
  LabeledCode,
  PartialPriorAuthArtifact,
} from "@/lib/priorAuth/artifactSchema";

/**
 * Deterministic CPT / ICD-10 backfill.
 *
 * The agent intermittently returns an artifact whose code lists are all empty
 * even when retrieval handed it a top-ranked guideline carrying dozens of
 * codes — and then writes a note ("no procedure-code list was returned") that
 * contradicts its own tool output. Prompt rules did not hold: the model
 * discards codes whose retrieved descriptor is the source document's phrasing
 * rather than an official title, and the scoping rule lets it justify the
 * emptiness.
 *
 * So we fill the gap in code instead. This module is pure: it takes the raw
 * commercial-search tool output(s) plus the parsed artifact, and returns an
 * artifact whose EMPTY code fields are supplemented from the highest-scoring
 * retrieved document. It never overwrites codes the model did supply, and
 * never touches `requestOverview.cpt` / `.icd10` — those are the USER's codes,
 * and inventing them would misreport the request.
 */

/** Codes lifted from the single highest-scoring retrieved document. */
export interface RetrievedCodes {
  cpt: LabeledCode[];
  icd10: LabeledCode[];
  /** title of the document the codes came from ("" when unknown) */
  sourceTitle: string;
  /** the procedures that document covers — the specificity signal */
  sourceProcedures: string[];
}

export const EMPTY_RETRIEVED_CODES: RetrievedCodes = {
  cpt: [],
  icd10: [],
  sourceTitle: "",
  sourceProcedures: [],
};

/**
 * Tool output renders each code as `CODE — descriptor` (see `labelCode`), or
 * bare when the corpus has no descriptor for it. Both em dash and hyphen
 * separators are accepted; anything else is treated as a bare code.
 */
export function parseLabeledCode(raw: unknown): LabeledCode | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  // An em dash separates a code from its descriptor, as does a hyphen — but
  // only a *spaced* one. An unspaced hyphen joins rather than separates:
  // "M50.00-M50.93" is an ICD-10 range, and splitting it produced {code:
  // "M50.00", label: "M50.93"} — a real code carrying a nonsense descriptor,
  // which then flowed into the report and into the evidence index as fact.
  // The "descriptor must contain a letter" guard cannot catch that, because
  // ICD-10 codes start with a letter. Spacing is what actually distinguishes
  // the two, and it also keeps "97110-59" intact as a modifier-bearing code.
  const m = text.match(/^(\S+?)(?:\s*—\s*|\s+-{1,2}\s+)(.*[A-Za-z].*)$/);
  if (m) return { code: m[1].trim(), label: m[2].trim() };

  // Bare code, or something with internal spaces we cannot split confidently.
  const [code, ...rest] = text.split(/\s+/);
  return { code, label: rest.join(" ") };
}

/**
 * Canonical form for comparing two codes.
 *
 * Trailing punctuation survives extraction from prose ("...see 72148."), so it
 * is stripped. Dots are NOT stripped — they are significant in ICD-10, where
 * M54.5 and M545 are different things.
 */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/[.,;:—-]+$/, "");
}

function dedupeByCode(codes: LabeledCode[]): LabeledCode[] {
  const seen = new Set<string>();
  const out: LabeledCode[] = [];
  for (const c of codes) {
    const key = normalizeCode(c.code);
    if (!c.code || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

interface ToolMatch {
  title?: unknown;
  score?: unknown;
  procedures?: unknown;
  cptCodes?: unknown;
  icd10Codes?: unknown;
}

/**
 * Pick the single best-scoring match across every commercial-search call in
 * the run and return its code arrays.
 *
 * One document, not a union of all of them: the top match is the document the
 * request is actually about, and pooling codes across lower-ranked matches
 * would attach unrelated procedures to the request.
 */
export function extractRetrievedCodes(
  toolOutputs: readonly string[],
): RetrievedCodes {
  let best: { score: number; match: ToolMatch } | null = null;

  for (const raw of toolOutputs) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const matches = (parsed as { topMatches?: unknown })?.topMatches;
    if (!Array.isArray(matches)) continue;

    for (const match of matches as ToolMatch[]) {
      if (!match || typeof match !== "object") continue;
      const score = typeof match.score === "number" ? match.score : -Infinity;
      const hasCodes =
        (Array.isArray(match.cptCodes) && match.cptCodes.length > 0) ||
        (Array.isArray(match.icd10Codes) && match.icd10Codes.length > 0);
      if (!hasCodes) continue;
      if (!best || score > best.score) best = { score, match };
    }
  }

  if (!best) return EMPTY_RETRIEVED_CODES;

  const toCodes = (v: unknown): LabeledCode[] =>
    dedupeByCode(
      (Array.isArray(v) ? v : [])
        .map(parseLabeledCode)
        .filter((c): c is LabeledCode => c !== null),
    );

  return {
    cpt: toCodes(best.match.cptCodes),
    icd10: toCodes(best.match.icd10Codes),
    sourceTitle: typeof best.match.title === "string" ? best.match.title : "",
    sourceProcedures: Array.isArray(best.match.procedures)
      ? best.match.procedures.filter((p): p is string => typeof p === "string")
      : [],
  };
}

// ---------------------------------------------------------------------------
// Specificity gate
// ---------------------------------------------------------------------------

/**
 * The retrieved code arrays are every code a document MENTIONS, not codes
 * chosen for the request. For a per-procedure policy that is a tight, on-topic
 * family; for a broad catalog it is a grab-bag spanning unrelated procedures —
 * the corpus's spine catalog carries 47 CPT that are mostly disc arthroplasty,
 * kyphoplasty and bone grafts.
 *
 * Filling "Likely CPT/HCPCS options" from a catalog would turn a visibly
 * incomplete answer into a confidently wrong one, which is the worse failure
 * in a clinical review. So the backfill only fires for a document specific
 * enough to be about the request: an empty list is the safer default.
 *
 * The specificity signal is `procedures`, NOT the code count. Measured on the
 * live table, count does not separate the two kinds of document at all —
 * "Permanent Pacemaker Implantation" carries 39 CPT and covers exactly one
 * procedure, while the "Musculoskeletal Surgery Guidelines" catalog carries 32
 * and covers thirty. `procedures` does separate them: a focused document lists
 * a synonym set for one procedure (Cervical Laminectomy 7, Pacemaker 8, Total
 * Knee Arthroplasty 5) while a catalog lists distinct ones (Spine Surgery 16,
 * Large Joint Surgery 26, MSK Guidelines 30).
 */
export const MAX_SOURCE_PROCEDURES = 10;

const TITLE_STOPWORDS = new Set([
  "a", "an", "and", "for", "of", "or", "the", "to", "with", "without",
  // Generic clinical filler that titles share with everything. "imaging" is
  // here because "Myocardial Perfusion Imaging" otherwise matches "MRI of the
  // knee" on that word alone.
  "criteria", "evaluation", "guideline", "guidelines", "imaging", "management",
  "medical", "necessity", "policy", "procedure", "procedures", "screening",
  "service", "services", "study", "surgery", "surgical", "test", "testing",
  "therapy", "total", "treatment",
]);

/**
 * Exported so the review gate's scoping check can ask the same question this
 * module asks. Two different tokenizers would mean two different definitions of
 * "matches the request", and the gate would flag codes the backfill accepted.
 */
export function contentTokens(text: string): Set<string> {
  return new Set(
    (text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !TITLE_STOPWORDS.has(t)),
  );
}

/**
 * Does the retrieved document look like it is about THIS request? Requires a
 * shared content word between the request and either a procedure the document
 * covers or its title.
 *
 * This rejects unrelated documents. It does NOT separate confusable siblings —
 * "C2-C5 laminectomy" matches both the cervical and the lumbar laminectomy
 * document, because the discriminating word is in neither request nor the
 * shared procedure name. Picking between siblings is the ranker's job; the
 * gate can only refuse what is plainly off-topic.
 */
export function sourceMatchesRequest(
  sourceTitle: string,
  sourceProcedures: readonly string[],
  treatment?: string,
  diagnosis?: string,
): boolean {
  const requestTokens = contentTokens(`${treatment ?? ""} ${diagnosis ?? ""}`);
  if (requestTokens.size === 0) return false;

  const candidates = [sourceTitle, ...(sourceProcedures ?? [])];
  for (const candidate of candidates) {
    const tokens = contentTokens(candidate);
    if (tokens.size === 0) continue;
    for (const t of requestTokens) if (tokens.has(t)) return true;
  }
  return false;
}

/** Why a backfill did not fire — surfaced for logging, never for the user. */
export type BackfillSkipReason =
  | "no-codes-retrieved"
  | "source-not-specific"
  | "source-does-not-match-request"
  | "nothing-empty";

/**
 * Provenance caveat attached to any list we fill. These codes were listed by
 * the matched guideline, not selected for the request — the reviewer has to
 * see that distinction, since add-on and revision codes commonly ride along in
 * the same family and are not billable as submitted.
 */
export const BACKFILL_NOTE =
  "Codes listed by the matched guideline rather than selected for this request — confirm the correct code(s), including any add-on or revision codes, for the service actually performed.";

/**
 * Notes that assert an absence retrieval contradicts. When we fill a list that
 * the model left empty, a note like "no procedure-code list was returned" is
 * false on its face and must go with it — a filled list under a note saying
 * there is no list reads as a bug to the reviewer.
 */
const CONTRADICTS_FILLED_LIST =
  /\b(no|none|not|without|absent|unavailable|did\s+not|were\s+not|was\s+not)\b[^.]{0,80}\b(code|codes|cpt|hcpcs|icd|list|listing)\b/i;

function isEmptyList(v: unknown): boolean {
  return !Array.isArray(v) || v.length === 0;
}

export interface BackfillResult {
  artifact: PartialPriorAuthArtifact;
  /** which fields were supplemented; empty when the artifact was left as-is */
  filled: string[];
  /** set when nothing was filled, for server-side logging */
  skipped?: BackfillSkipReason;
}

/**
 * Supplement an artifact's empty code fields from the retrieved codes.
 *
 * Fires only when the retrieved document is specific enough to be about this
 * request (see the specificity gate above) — otherwise the fields are left
 * empty, which is the honest answer.
 *
 * Fills, only when already empty:
 *  - `relevantCodes.cpt` / `relevantCodes.icd10` (dropping a contradicting note)
 *  - `requestOverview.suggestedCpt` / `.suggestedIcd10`, and only when the
 *    user supplied no codes of that type — "likely options" is meaningless
 *    next to codes the user already gave us.
 *
 * Returns the SAME artifact reference when nothing changed, so callers can
 * cheaply detect a no-op.
 */
export function backfillArtifactCodes(
  artifact: PartialPriorAuthArtifact,
  codes: RetrievedCodes,
): BackfillResult {
  if (!artifact || (codes.cpt.length === 0 && codes.icd10.length === 0)) {
    return { artifact, filled: [], skipped: "no-codes-retrieved" };
  }

  const overview = artifact.requestOverview ?? {};

  // Gate 1 — a catalog document's code arrays are not about any one request.
  // A source with no `procedures` at all cannot be shown to be specific, so it
  // is refused too: filling nothing is the safe outcome.
  if (
    codes.sourceProcedures.length === 0 ||
    codes.sourceProcedures.length > MAX_SOURCE_PROCEDURES
  ) {
    return { artifact, filled: [], skipped: "source-not-specific" };
  }

  // Gate 2 — the document has to be about the treatment we are filing under.
  if (
    !sourceMatchesRequest(
      codes.sourceTitle,
      codes.sourceProcedures,
      overview.treatment,
      overview.diagnosis,
    )
  ) {
    return { artifact, filled: [], skipped: "source-does-not-match-request" };
  }

  const filled: string[] = [];
  const relevant = artifact.relevantCodes ?? {};

  // A filled list always carries the provenance caveat. An existing note that
  // contradicts the list is dropped outright; a legitimate one is kept and the
  // caveat appended.
  const noteFor = (existing?: string): string => {
    if (
      typeof existing !== "string" ||
      !existing.trim() ||
      CONTRADICTS_FILLED_LIST.test(existing)
    ) {
      return BACKFILL_NOTE;
    }
    return `${existing.trim()} ${BACKFILL_NOTE}`;
  };

  const nextRelevant = { ...relevant };
  if (codes.cpt.length > 0 && isEmptyList(relevant.cpt)) {
    nextRelevant.cpt = codes.cpt;
    nextRelevant.cptNote = noteFor(relevant.cptNote);
    filled.push("relevantCodes.cpt");
  }
  if (codes.icd10.length > 0 && isEmptyList(relevant.icd10)) {
    nextRelevant.icd10 = codes.icd10;
    nextRelevant.icd10Note = noteFor(relevant.icd10Note);
    filled.push("relevantCodes.icd10");
  }

  // `requestOverview.suggestedCpt` / `.suggestedIcd10` are deliberately NOT
  // filled. The retrieved array is every code the document mentions — 25 CPT
  // for Cervical Laminectomy, fusion and arthroplasty included — whereas the
  // agent, when it writes these lists itself, narrows them to the handful that
  // apply. Filling one empty list from the raw array while the agent's own
  // scoped codes sit in `relevantCodes` would put two contradictory code lists
  // in front of the reviewer, manufactured by us. Measured: those two lists
  // already disagree in roughly a third of runs without any help from here.
  //
  // `relevantCodes` is the narrower blast radius: it is the section that
  // documents what the guideline covers, so the document's own list is the
  // honest answer there, and it carries BACKFILL_NOTE saying so.

  if (filled.length === 0) return { artifact, filled, skipped: "nothing-empty" };

  const next: PartialPriorAuthArtifact = { ...artifact };
  if (artifact.relevantCodes || nextRelevant.cpt || nextRelevant.icd10) {
    next.relevantCodes = nextRelevant;
  }
  return { artifact: next, filled };
}

// ---------------------------------------------------------------------------
// Streaming wire format
// ---------------------------------------------------------------------------

/**
 * The web client streams the artifact token-by-token and renders sections as
 * they arrive, so the server cannot rewrite an array it has already emitted.
 * Instead it appends a patch frame after the artifact:
 *
 *   {"kind":"prior-auth-summary", …}\n␞{"cpt":[…],"icd10":[…],"sourceTitle":"…"}
 *
 * Every text → artifact parse site goes through `parseArtifactText`, which
 * strips the frame and merges it with the same `backfillArtifactCodes` policy
 * the buffered path uses. The frame is persisted with the message, so history
 * replay and the PDF export see the merged artifact too.
 *
 * A half-received frame (the stream cut mid-patch) parses as "no patch" and
 * the artifact renders exactly as it did before.
 */
export const CODE_PATCH_SENTINEL = "␞";

/**
 * @deprecated No longer emitted — the server now buffers the artifact and
 * repairs it before sending, so there is nothing to patch after the fact. Kept
 * (with its tests) to pin the wire format that historical messages use.
 *
 * `splitCodePatch` below is NOT deprecated and must stay in the parse pipeline
 * permanently: rows written before buffering shipped still carry these frames.
 */
export function encodeCodePatch(codes: RetrievedCodes): string {
  return `\n${CODE_PATCH_SENTINEL}${JSON.stringify(codes)}`;
}

export function splitCodePatch(text: string): {
  body: string;
  codes: RetrievedCodes | null;
} {
  if (typeof text !== "string") return { body: "", codes: null };
  const i = text.lastIndexOf(CODE_PATCH_SENTINEL);
  if (i === -1) return { body: text, codes: null };

  // Truncating at the sentinel is correct even when the tail does not parse:
  // control frames are only ever emitted *before* the answer, so anything
  // following the artifact is a legacy patch, and a half-written one must not
  // be fed to the JSON parser. A partial frame arriving before the artifact
  // yields an empty body, which is right — the answer has not been sent yet.
  const body = text.slice(0, i);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(i + CODE_PATCH_SENTINEL.length));
  } catch {
    return { body, codes: null };
  }
  const p = parsed as Partial<RetrievedCodes>;
  if (!p || typeof p !== "object") return { body, codes: null };
  if (!Array.isArray(p.cpt) && !Array.isArray(p.icd10)) {
    return { body, codes: null };
  }
  return {
    body,
    codes: {
      cpt: Array.isArray(p.cpt) ? p.cpt : [],
      icd10: Array.isArray(p.icd10) ? p.icd10 : [],
      sourceTitle: typeof p.sourceTitle === "string" ? p.sourceTitle : "",
      sourceProcedures: Array.isArray(p.sourceProcedures)
        ? p.sourceProcedures.filter((x): x is string => typeof x === "string")
        : [],
    },
  };
}

/** Tool names whose output carries per-document code arrays. */
const CODE_BEARING_TOOLS = new Set(["commercial_guidelines_search"]);

/**
 * Every tool whose output the review gate can read as evidence.
 *
 * Wider than CODE_BEARING_TOOLS on purpose. The Medicare tools carry codes in a
 * different shape (objects, not `CODE — label` strings) or carry no codes at
 * all but still prove that Medicare retrieval happened — which is what lets the
 * structural check tell "the agent dropped the policies section" apart from
 * "there were no policies to report". SerpAPI is excluded: free-form web text
 * is not something we can attribute a code to.
 */
export const EVIDENCE_TOOLS = new Set([
  "commercial_guidelines_search",
  "medicare_multi_search",
  "medicare_policy_detail",
  "policy_content_extractor",
  "ncd_coverage_search",
  "local_lcd_search",
  "local_coverage_article_search",
]);

/** A tool call's raw output, tagged with the tool that produced it. */
export interface ToolMessageRecord {
  name: string;
  content: string;
}

/**
 * Collect tool outputs from a finished LangGraph run (`result.messages`),
 * oldest first. Tolerant of message shapes: only `_getType() === "tool"`
 * messages with a string `content` are read.
 *
 * The tool name is kept because output shapes differ per tool and the evidence
 * extractor dispatches on it.
 */
export function collectToolMessages(
  messages: readonly unknown[],
  allow: ReadonlySet<string> = EVIDENCE_TOOLS,
): ToolMessageRecord[] {
  const out: ToolMessageRecord[] = [];
  for (const m of messages ?? []) {
    const msg = m as {
      _getType?: () => string;
      name?: unknown;
      content?: unknown;
    };
    if (typeof msg?._getType !== "function" || msg._getType() !== "tool") {
      continue;
    }
    if (typeof msg.name !== "string" || !allow.has(msg.name)) continue;
    if (typeof msg.content === "string") {
      out.push({ name: msg.name, content: msg.content });
    }
  }
  return out;
}

/**
 * The code-bearing subset, as raw strings — what `extractRetrievedCodes` takes.
 */
export function collectToolOutputs(messages: readonly unknown[]): string[] {
  return collectToolMessages(messages, CODE_BEARING_TOOLS).map((m) => m.content);
}
