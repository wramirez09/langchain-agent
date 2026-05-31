import {
  CommercialGuidelineDoc,
  CommercialGuidelineSearchInput,
  ScoredResult,
  MergedSourceInfo,
} from "./commercialGuidelineTypes";
import { expandDomain } from "./commercialGuidelineMetadataIndex";

// NOTE: normalize/tokenize/keywordOverlap here intentionally diverge from
// scoreMedicareDocument.ts (different unicode handling, dedup, and overlap
// formula). Do not extract to a shared util without re-verifying scores.
function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Tokenize a string into keywords (split on spaces, remove short words)
 */
function tokenize(str: string): string[] {
  return normalize(str)
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/**
 * Calculate keyword overlap percentage between two strings
 */
function keywordOverlap(str1: string, str2: string): number {
  const tokens1 = new Set(tokenize(str1));
  const tokens2 = new Set(tokenize(str2));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
  return intersection.size / Math.min(tokens1.size, tokens2.size);
}

/**
 * Build normalized inverse-document-frequency weights over the phrase
 * vocabulary (procedures + aliases + specialty + tags + title + treatment) of
 * the candidate set. Normalized so the rarest token weighs ~1 and the most
 * common ~0. Generic tokens shared by many docs ("coronary", "cardiac",
 * "imaging") end up cheap; distinctive tokens ("calcium", "angiography",
 * "laminectomy") stay valuable. Without this, a doc that matches a query's
 * GENERIC word scores the same as one that matches its DISTINCTIVE word, so a
 * broad multi-procedure doc out-bulks the one doc that actually targets the
 * requested procedure (e.g. "coronary angiography" tied "coronary artery
 * calcium scoring" for a calcium-score query because both share "coronary").
 */
function buildTokenSpecificity(
  docs: CommercialGuidelineDoc[],
): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    const phrases = [
      ...(doc.procedures ?? []),
      ...(doc.aliases ?? []),
      ...(doc.specialty ?? []),
      ...(doc.tags ?? []),
      doc.title ?? "",
      doc.treatment ?? "",
    ];
    const seen = new Set<string>();
    for (const p of phrases) for (const t of tokenize(p)) seen.add(t);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = Math.max(docs.length, 1);
  let maxIdf = 0;
  const raw = new Map<string, number>();
  for (const [t, n] of df) {
    const idf = Math.log((N + 1) / (n + 0.5));
    raw.set(t, idf);
    if (idf > maxIdf) maxIdf = idf;
  }
  if (maxIdf <= 0) return raw;
  const weights = new Map<string, number>();
  for (const [t, idf] of raw) weights.set(t, idf / maxIdf); // normalize to (0,1]
  return weights;
}

/**
 * Specificity "mass" of a phrase against the query intent token sets: the summed
 * weight of the DISTINCT phrase tokens that appear in the intent. With a
 * specificity map, distinctive shared tokens dominate; without one (unit tests),
 * every shared token weighs 1, reproducing the legacy "any token matches" gate.
 */
function specificityMass(
  phrase: string,
  intents: Set<string>[],
  weights?: Map<string, number>,
): number {
  let mass = 0;
  for (const t of new Set(tokenize(phrase))) {
    if (intents.some((s) => s.has(t)))
      mass += weights ? (weights.get(t) ?? 0) : 1;
  }
  return mass;
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = normalize(str1);
  const s2 = normalize(str2);

  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * Calculate fuzzy similarity score (0-1)
 */
function fuzzySimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLen;
}

// Pull the clinically decisive sections out of a guideline body instead of a
// blind substring of the opening. Payer-critical detail (e.g. "failure of at
// least 6 weeks of conservative treatment", structured component lists) lives
// deep in the body; a substring(0, N) excerpt truncated it, so the agent only
// ever saw generic intro text and reconstructed vague criteria.
const SECTION_ANCHORS: { re: RegExp; take: number }[] = [
  { re: /medical necessity/i, take: 1800 },
  {
    re: /clinical (?:indications|appropriateness)|indications for|coverage (?:criteria|is considered|requires)/i,
    take: 1400,
  },
  { re: /conservative (?:treatment|therapy|management|care)/i, take: 1000 },
  {
    re: /required documentation|documentation (?:required|needed|requirements)/i,
    take: 900,
  },
  {
    re: /limitations|exclusions|not (?:medically )?(?:necessary|covered)/i,
    take: 800,
  },
];

// Walk backwards from `pos` to the start of the heading that introduces this
// section, so a query-anchored excerpt begins at a heading rather than mid-line.
// Recognizes markdown headings (`#`/`>` prefixes) and ALL-CAPS headings like
// "INDICATIONS FOR CORONARY ARTERY CALCIUM".
function sectionStart(body: string, pos: number): number {
  const floor = Math.max(0, pos - 2000);
  for (let i = pos - 1; i > floor; i--) {
    if (body[i] !== "\n") continue;
    const lineStart = i + 1;
    let j = lineStart;
    while (
      j < body.length &&
      (body[j] === " " || body[j] === "\t" || body[j] === ">")
    )
      j++;
    if (body[j] === "#") return lineStart;
    const nl = body.indexOf("\n", lineStart);
    const line = body.substring(lineStart, nl < 0 ? body.length : nl).trim();
    if (/^[A-Z][A-Z0-9 ,/()\-]{6,}$/.test(line)) return lineStart;
  }
  return Math.max(0, pos - 150);
}

// Bias a candidate section toward the kind of heading we want to lead with:
// criteria/indications headings win; documentation/codes/reference headings are
// penalized so a tight "CAC"/"calcium" cluster in a Required Documentation or
// Relevant Codes block doesn't outscore the actual criteria section.
function headingBias(body: string, lineStart: number): number {
  const nl = body.indexOf("\n", lineStart);
  const line = body
    .substring(lineStart, nl < 0 ? body.length : nl)
    .toLowerCase();
  if (
    /medical necessity|indication|criteria|coverage|considered medically|clinical appropriateness/.test(
      line,
    )
  )
    return 2;
  if (
    /documentation|relevant codes|coding|references|bibliography|submitted for review/.test(
      line,
    )
  )
    return -2;
  return 0;
}

// Find where the distinctive query terms cluster most densely in the body, and
// return the start of the heading that introduces that cluster. In aggregator
// guidelines that bundle dozens of procedures, the criteria the user asked about
// sit deep in the doc beside the procedure name; the first generic "medical
// necessity" heading is a payer preamble. Anchoring on the term cluster — biased
// toward criteria/indication headings — lets the excerpt lead with the right
// procedure's criteria instead of boilerplate, documentation, or a code list.
function bestQueryAnchor(body: string, terms: string[]): number {
  const lower = body.toLowerCase();
  const positions: number[] = [];
  for (const raw of terms) {
    const term = raw.toLowerCase().trim();
    if (term.length < 3) continue;
    let i = lower.indexOf(term);
    while (i >= 0) {
      positions.push(i);
      i = lower.indexOf(term, i + term.length);
    }
  }
  if (positions.length === 0) return -1;
  positions.sort((a, b) => a - b);
  const WINDOW = 800;
  let best = -1;
  let bestScore = -Infinity;
  for (let s = 0; s < positions.length; s++) {
    let e = s;
    while (e < positions.length && positions[e] - positions[s] <= WINDOW) e++;
    const start = sectionStart(body, positions[s]);
    const score = e - s + headingBias(body, start);
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return best;
}

// Stitch a set of body ranges into a budget-bounded excerpt, merging
// overlapping/adjacent ranges and preserving document order.
function assembleRanges(
  body: string,
  ranges: [number, number][],
  maxChars: number,
): string {
  ranges.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 40) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = "";
  for (const [s, e] of merged) {
    if (out.length >= maxChars) break;
    const chunk = body.substring(s, e).trim();
    if (chunk) out += (out ? "\n…\n" : "") + chunk;
  }
  return out.substring(0, maxChars).trim();
}

export function extractRelevantSections(
  body: string,
  maxChars: number,
  queryTerms?: string[],
): string {
  if (!body) return "";
  if (body.length <= maxChars) return body.trim();

  // Legacy decisive sections: opening + the first global match of each anchor.
  // For a focused single-procedure doc the first "medical necessity" match IS
  // the criteria, so this alone is correct; for an aggregator it's a generic
  // preamble, which the query window below fixes.
  const legacy: [number, number][] = [[0, 300]];
  for (const a of SECTION_ANCHORS) {
    const m = a.re.exec(body);
    if (m && m.index != null)
      legacy.push([m.index, Math.min(body.length, m.index + a.take)]);
  }

  const queryAnchor =
    queryTerms && queryTerms.length > 0
      ? bestQueryAnchor(body, queryTerms)
      : -1;

  // Only override with the query window when the relevant criteria sit DEEP in
  // the doc (an aggregator that bundles many procedures). If the cluster is
  // within the first `maxChars`, the doc is effectively focused and the legacy
  // lead-from-the-top extraction already captures its criteria — anchoring mid-
  // doc there would skip the criteria above the cluster.
  if (queryAnchor < maxChars) return assembleRanges(body, legacy, maxChars);

  // Query-aware: reserve budget for the query-anchored window so it always
  // survives (it leads, in document order it could be deep in an aggregator and
  // get truncated otherwise), then fill the remainder with the legacy decisive
  // sections that don't overlap it. This keeps the focused doc's criteria (via
  // the legacy "medical necessity" match) AND surfaces the aggregator's
  // procedure-specific criteria (via the query window).
  const qStart = queryAnchor;
  const qEnd = Math.min(body.length, queryAnchor + 1800);
  const queryChunk = body.substring(qStart, qEnd).trim();
  let out = queryChunk;
  const remaining = maxChars - out.length - 4;
  if (remaining > 200) {
    const rest = legacy.filter(([s, e]) => e <= qStart || s >= qEnd);
    const tail = assembleRanges(body, rest, remaining);
    if (tail) out += "\n…\n" + tail;
  }
  return out.substring(0, maxChars).trim();
}

/**
 * Score a commercial guideline document against search input
 * Returns score and list of matched signals
 */
export function scoreCommercialGuideline(
  doc: CommercialGuidelineDoc,
  input: CommercialGuidelineSearchInput,
  idf?: Map<string, number>,
): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];

  // Normalize input CPT codes (handle both string and array)
  const inputCptCodes = input.cpt
    ? Array.isArray(input.cpt)
      ? input.cpt
      : [input.cpt]
    : [];

  // Normalize input ICD-10 codes (handle both string and array)
  const inputIcd10Codes = input.icd10
    ? Array.isArray(input.icd10)
      ? input.icd10
      : [input.icd10]
    : [];

  // +10 for exact CPT match
  if (inputCptCodes.length > 0 && doc.cptCodes) {
    for (const inputCpt of inputCptCodes) {
      if (doc.cptCodes.includes(inputCpt)) {
        score += 10;
        matchedOn.push(`cpt:${inputCpt}`);
      }
    }
  }

  // +10 for exact ICD-10 match
  if (inputIcd10Codes.length > 0 && doc.icd10Codes) {
    for (const inputIcd10 of inputIcd10Codes) {
      const normalizedInput = inputIcd10.toUpperCase();
      if (
        doc.icd10Codes.some((code) => code.toUpperCase() === normalizedInput)
      ) {
        score += 10;
        matchedOn.push(`icd10:${normalizedInput}`);
      }
    }
  }

  // +5 for exact treatment match (case-insensitive)
  if (input.treatment && doc.treatment) {
    if (normalize(input.treatment) === normalize(doc.treatment)) {
      score += 5;
      matchedOn.push("treatment:exact");
    }
  }

  // +3 for treatment keyword overlap (>50%)
  if (input.treatment && doc.treatment) {
    const overlap = keywordOverlap(input.treatment, doc.treatment);
    if (overlap > 0.5) {
      score += 3;
      matchedOn.push(`treatment:overlap:${Math.round(overlap * 100)}%`);
    }
  }

  // +3 for diagnosis keyword overlap (>50%)
  if (input.diagnosis && doc.body) {
    const overlap = keywordOverlap(input.diagnosis, doc.body);
    if (overlap > 0.3) {
      score += 3;
      matchedOn.push(`diagnosis:overlap:${Math.round(overlap * 100)}%`);
    }
  }

  // +3 for query keyword overlap with title
  if (input.query && doc.title) {
    const overlap = keywordOverlap(input.query, doc.title);
    if (overlap > 0.4) {
      score += 3;
      matchedOn.push(`query:title:${Math.round(overlap * 100)}%`);
    }
  }

  // +2 for query keyword overlap with body
  if (input.query && doc.body) {
    const overlap = keywordOverlap(input.query, doc.body);
    if (overlap > 0.2) {
      score += 2;
      matchedOn.push(`query:body:${Math.round(overlap * 100)}%`);
    }
  }

  // +2 for domain match (normalized: "musculoskeletal" must match the corpus's
  // "muscle", etc. — without this an in-domain surgery doc misses its bonus).
  if (input.domain && doc.domain) {
    const accepted = expandDomain(normalize(input.domain));
    const docDomain = normalize(doc.domain);
    if (accepted.some((d) => docDomain.includes(d) || d.includes(docDomain))) {
      score += 2;
      matchedOn.push(`domain:${doc.domain}`);
    }
  }

  // +1 for payer match (if applicable)
  if (input.payer && doc.body) {
    const normalizedPayer = normalize(input.payer);
    if (normalize(doc.body).includes(normalizedPayer)) {
      score += 1;
      matchedOn.push(`payer:${input.payer}`);
    }
  }

  // +1-3 for fuzzy similarity (tiebreaker)
  if (input.treatment && doc.title) {
    const similarity = fuzzySimilarity(input.treatment, doc.title);
    if (similarity > 0.6) {
      const fuzzyScore = Math.round(similarity * 3);
      score += fuzzyScore;
      matchedOn.push(`fuzzy:${Math.round(similarity * 100)}%`);
    }
  }

  // Query/treatment/diagnosis token sets. Procedure/specialty/alias fields
  // describe the PROCEDURE the user wants, so they are matched on treatment
  // intent — NOT on diagnosis words. The query folds the diagnosis in, so
  // without removing diagnosis tokens a symptom word like "neck" (from diagnosis
  // "neck pain") matches an imaging doc's "neck MRI" and lets imaging outrank the
  // actual surgery guideline. relatedConditions (below) is the field that
  // legitimately matches the diagnosis.
  const queryTokenSet = new Set(tokenize(input.query));
  const treatmentTokenSet = input.treatment
    ? new Set(tokenize(input.treatment))
    : new Set<string>();
  const diagnosisTokenSet = new Set(tokenize(input.diagnosis ?? ""));
  const procedureIntentTokens = new Set(
    [...queryTokenSet, ...treatmentTokenSet].filter(
      (t) => !diagnosisTokenSet.has(t),
    ),
  );

  // Whole-word overlap used by relatedConditions: at least one token of `phrase`
  // appears as a token in any of the input token sets.
  const phraseTokensIn = (
    phrase: string,
    ...inputs: Set<string>[]
  ): boolean => {
    const phraseTokens = tokenize(phrase);
    if (phraseTokens.length === 0) return false;
    return phraseTokens.some((t) => inputs.some((s) => s.has(t)));
  };

  // Specificity-weighted phrase scoring. Each of the two best-matching phrases
  // earns up to `baseWeight`, scaled by how DISTINCTIVE its shared tokens are
  // (via `idf`), so a match on a query's generic word ("coronary") is worth far
  // less than a match on its specific word ("calcium") — this is what lets the
  // doc that truly targets the requested procedure outrank a broad doc that
  // merely shares a common word. The two-phrase cap keeps a doc with many weak
  // matches from out-scoring an exact CPT/ICD-10 hit (+10). Without `idf` (unit
  // tests) every shared token weighs 1, reproducing the legacy gate.
  // Keep the single best matching phrase, plus a second ONLY if it is itself
  // distinctive (mass ≥ DISTINCTIVE_MASS). Otherwise a broad aggregator doc
  // banks a second slot on a generic-token-only match (e.g. "coronary artery
  // bypass graft" matching just "coronary") and edges out the focused doc that
  // actually targets the requested procedure.
  const DISTINCTIVE_MASS = 0.5;
  const pickTop2 = (ranked: { p: string; mass: number }[]) => {
    const out = ranked.slice(0, 1);
    if (ranked[1] && ranked[1].mass >= DISTINCTIVE_MASS) out.push(ranked[1]);
    return out;
  };
  const awardPhrases = (
    phrases: string[] | undefined,
    intents: Set<string>[],
    baseWeight: number,
    label: string,
  ) => {
    if (!phrases || phrases.length === 0) return;
    const ranked = pickTop2(
      phrases
        .map((p) => ({ p, mass: specificityMass(p, intents, idf) }))
        .filter((m) => m.mass > 0)
        .sort((a, b) => b.mass - a.mass),
    );
    if (ranked.length === 0) return;
    score += ranked.reduce((s, m) => s + baseWeight * Math.min(1, m.mass), 0);
    matchedOn.push(`${label}:${ranked.map((m) => m.p).join(",")}`);
  };

  // Tags (keywords) — query-intent match, low weight, capped (was uncapped, which
  // let a doc with many incidental tag hits, e.g. "calcium channel blocker" on a
  // calcium query, inflate past the truly-relevant doc).
  awardPhrases(doc.tags, [queryTokenSet], 2, "tags");

  // +5 specialty, on procedure intent.
  awardPhrases(doc.specialty, [procedureIntentTokens], 5, "specialty");

  // +8 procedures, on procedure intent. A near-exact treatment phrase still
  // counts even if its tokens are common, so a precise treatment string isn't
  // penalized for being made of plain words.
  const procedureRanked = pickTop2(
    (doc.procedures ?? [])
      .map((p) => {
        let mass = specificityMass(p, [procedureIntentTokens], idf);
        if (
          mass === 0 &&
          input.treatment &&
          keywordOverlap(p, input.treatment) > 0.5
        )
          mass = 0.5;
        return { p, mass };
      })
      .filter((m) => m.mass > 0)
      .sort((a, b) => b.mass - a.mass),
  );
  if (procedureRanked.length > 0) {
    score += procedureRanked.reduce((s, m) => s + 8 * Math.min(1, m.mass), 0);
    matchedOn.push(`procedures:${procedureRanked.map((m) => m.p).join(",")}`);
  }

  // +6 aliases, on procedure intent.
  awardPhrases(doc.aliases, [procedureIntentTokens], 6, "aliases");

  // +4 per related condition (capped at 2)
  if (
    doc.relatedConditions &&
    doc.relatedConditions.length > 0 &&
    input.diagnosis
  ) {
    const diagnosis = input.diagnosis;
    const matchingConditions = doc.relatedConditions.filter(
      (condition) =>
        phraseTokensIn(condition, diagnosisTokenSet) ||
        keywordOverlap(condition, diagnosis) > 0.4,
    );
    if (matchingConditions.length > 0) {
      score += Math.min(matchingConditions.length, 2) * 4;
      matchedOn.push(`relatedConditions:${matchingConditions.join(",")}`);
    }
  }

  // +3 for payer-specific notes match (from front matter)
  if (doc.payerNotes && input.payer) {
    const payerNorm = normalize(input.payer);
    const matchingPayers = Object.keys(doc.payerNotes).filter(
      (payer) =>
        normalize(payer).includes(payerNorm) ||
        payerNorm.includes(normalize(payer)),
    );

    if (matchingPayers.length > 0) {
      score += 3;
      matchedOn.push(`payerNotes:${matchingPayers.join(",")}`);
    }
  }

  // Priority boost (from front matter)
  if (doc.priority) {
    if (doc.priority === "high") {
      score += 2;
      matchedOn.push("priority:high");
    } else if (doc.priority === "medium") {
      score += 1;
      matchedOn.push("priority:medium");
    }
  }

  return { score, matchedOn };
}

/** True if two domains belong to the same clinical family (muscle≈orthopedics
 * ≈spine≈physical-medicine, etc.), via the shared domain-synonym map. */
function sameDomainFamily(d1?: string, d2?: string): boolean {
  if (!d1 || !d2) return false;
  if (normalize(d1) === normalize(d2)) return true;
  const fam1 = new Set(expandDomain(normalize(d1)));
  return expandDomain(normalize(d2)).some((x) => fam1.has(x));
}

/**
 * Check if two documents overlap based on shared codes or treatment similarity
 */
function documentsOverlap(doc1: ScoredResult, doc2: ScoredResult): boolean {
  // Only merge within the same clinical domain family.
  if (!sameDomainFamily(doc1.domain, doc2.domain)) return false;

  // Require genuine treatment/title similarity to merge. Post-enrichment every
  // doc carries many CPT/ICD-10 codes, so a single shared code is now weak
  // evidence of being the same guideline: merging on it chained unrelated
  // procedures (angiography, PCI, EP study, pacemaker) into one mega-result
  // whose 5k-char excerpt buried the doc the user actually asked about and led
  // with generic boilerplate from whichever member happened to score highest.
  // Near-identical guidelines (e.g. the same procedure across payer files) still
  // share a title and merge; distinct procedures that merely share a code do not.
  const a = doc1.treatment || doc1.title || "";
  const b = doc2.treatment || doc2.title || "";
  return keywordOverlap(a, b) > 0.7;
}

/**
 * Detect groups of overlapping documents
 * Returns a map where key is the representative doc ID and value is array of overlapping docs
 */
function detectOverlappingDocuments(
  scoredDocs: ScoredResult[],
): Map<string, ScoredResult[]> {
  const groups = new Map<string, ScoredResult[]>();
  const processed = new Set<string>();

  for (let i = 0; i < scoredDocs.length; i++) {
    const doc1 = scoredDocs[i];

    if (processed.has(doc1.id)) continue;

    const group: ScoredResult[] = [doc1];
    processed.add(doc1.id);

    // Find all documents that overlap with doc1
    for (let j = i + 1; j < scoredDocs.length; j++) {
      const doc2 = scoredDocs[j];

      if (processed.has(doc2.id)) continue;

      if (documentsOverlap(doc1, doc2)) {
        group.push(doc2);
        processed.add(doc2.id);
      }
    }

    // Only create a group if there are multiple overlapping documents
    if (group.length > 1) {
      groups.set(doc1.id, group);
    }
  }

  return groups;
}

/**
 * Merge multiple overlapping documents into a single comprehensive result
 */
function mergeDocuments(
  docs: ScoredResult[],
  fullDocs: CommercialGuidelineDoc[],
  anchorTerms?: string[],
): ScoredResult {
  // Use the highest-scoring document as the base
  const baseDoc = docs[0];

  // Combine all CPT codes
  const allCptCodes = new Set<string>();
  docs.forEach((doc) => {
    if (doc.cptCodes) {
      doc.cptCodes.forEach((code) => allCptCodes.add(code));
    }
  });

  // Combine all ICD-10 codes
  const allIcd10Codes = new Set<string>();
  docs.forEach((doc) => {
    if (doc.icd10Codes) {
      doc.icd10Codes.forEach((code) => allIcd10Codes.add(code.toUpperCase()));
    }
  });

  // Combine all match signals
  const allMatchedOn = new Set<string>();
  docs.forEach((doc) => {
    doc.matchedOn.forEach((signal) => allMatchedOn.add(signal));
  });

  // Merged score is the max member score — no inflation for group size
  const mergedScore = Math.max(...docs.map((d) => d.score));

  // Merged excerpt: pull the decisive sections (medical necessity, conservative
  // therapy, documentation, exclusions) from each source rather than the first
  // N chars, so payer-critical detail survives the merge.
  const mergedExcerpt = docs
    .map((doc, index) => {
      const fullDoc = fullDocs.find((fd) => fd.id === doc.id);
      const excerpt = fullDoc
        ? extractRelevantSections(fullDoc.body, 6000, anchorTerms)
        : doc.excerpt;
      return index === 0 ? excerpt : `\n\n[Source ${index + 1}]: ${excerpt}`;
    })
    .join("");

  // Cap the merged excerpt so a many-source merge can't blow the output budget.
  // (shrinkToFit in the tool still enforces the overall budget; this is a
  // per-merge guard.)
  const finalExcerpt =
    mergedExcerpt.length > 12000
      ? mergedExcerpt.substring(0, 12000).trim() + "..."
      : mergedExcerpt.trim() + "...";

  // Create merged source info
  const mergedFrom: MergedSourceInfo[] = docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    path: doc.path,
  }));

  // Create merged result WITHOUT full body to prevent token overflow
  return {
    id: `merged-${docs.map((d) => d.id).join("-")}`,
    title: baseDoc.title + ` (${docs.length} sources)`,
    score: mergedScore,
    domain: baseDoc.domain,
    matchedOn: Array.from(allMatchedOn),
    excerpt: finalExcerpt,
    path: baseDoc.path,
    treatment: baseDoc.treatment,
    cptCodes: Array.from(allCptCodes),
    icd10Codes: Array.from(allIcd10Codes),
    mergedFrom,
    // body field removed to prevent token overflow
  };
}

// Distinctive terms used to anchor query-aware excerpting: the full treatment
// phrase plus the query/treatment tokens that are rare across the candidate
// corpus (high idf). Generic words ("coronary", "spine", "imaging") are excluded
// so excerpts lock onto the procedure the user asked about — e.g. "calcium" /
// "laminectomy" — rather than the first generic heading in an aggregator doc.
function buildAnchorTerms(
  input: CommercialGuidelineSearchInput,
  idf: Map<string, number>,
): string[] {
  const terms = new Set<string>();
  const treatment = (input.treatment ?? "").trim();
  if (treatment.length >= 3) terms.add(treatment.toLowerCase());
  // Exclude diagnosis tokens (e.g. "cad") — like procedure matching, anchoring
  // must track the PROCEDURE, not the symptom. A diagnosis word clusters densely
  // in an unrelated symptom/work-up section and would drag the anchor off the
  // requested procedure's criteria.
  const diagnosisTokens = new Set(tokenize(input.diagnosis ?? ""));
  for (const t of tokenize(`${input.query ?? ""} ${treatment}`)) {
    if (diagnosisTokens.has(t)) continue;
    if ((idf.get(t) ?? 0) >= 0.45) terms.add(t);
  }
  return [...terms];
}

/**
 * Score and rank all documents, returning top and related matches
 */
export function scoreAndRankDocuments(
  docs: CommercialGuidelineDoc[],
  input: CommercialGuidelineSearchInput,
  enableMerging: boolean = true,
): { topMatches: ScoredResult[]; relatedMatches: ScoredResult[] } {
  console.log(`[ScoreEngine] Scoring ${docs.length} documents against input:`, {
    query: input.query,
    treatment: input.treatment,
    diagnosis: input.diagnosis,
    cpt: input.cpt,
    icd10: input.icd10,
    domain: input.domain,
  });

  // Token-specificity weights computed once over the candidate set, so generic
  // shared words ("coronary") count for less than distinctive ones ("calcium").
  const idf = buildTokenSpecificity(docs);

  // Distinctive query terms drive query-aware excerpting (see buildAnchorTerms).
  const anchorTerms = buildAnchorTerms(input, idf);

  // Score all documents
  const scoredDocs: ScoredResult[] = docs.map((doc) => {
    const { score, matchedOn } = scoreCommercialGuideline(doc, input, idf);

    return {
      id: doc.id,
      title: doc.title,
      score,
      domain: doc.domain,
      matchedOn,
      // Pass the doc's content as fully as possible: a focused single-procedure
      // doc (<=~20k chars) is returned WHOLE so the agent sees the original
      // criteria verbatim rather than a trimmed/summarized slice; only the large
      // multi-procedure aggregators get section-extracted. shrinkToFit (in the
      // tool) preserves the top match and trims lower-ranked ones if the total
      // output exceeds budget.
      excerpt: extractRelevantSections(doc.body, 20000, anchorTerms),
      path: doc.path,
      treatment: doc.treatment,
      cptCodes: doc.cptCodes,
      icd10Codes: doc.icd10Codes,
    };
  });

  // Sort by score descending
  scoredDocs.sort((a, b) => b.score - a.score);

  // Filter out zero-score results
  let relevantDocs = scoredDocs.filter((doc) => doc.score > 0);

  console.log(`[ScoreEngine] Found ${relevantDocs.length} relevant documents`);

  // Detect and merge overlapping documents if enabled
  if (enableMerging && relevantDocs.length > 1) {
    const overlappingGroups = detectOverlappingDocuments(relevantDocs);

    if (overlappingGroups.size > 0) {
      console.log(
        `[ScoreEngine] Detected ${overlappingGroups.size} groups of overlapping documents`,
      );

      // Create merged documents
      const mergedDocs: ScoredResult[] = [];
      const mergedDocIds = new Set<string>();

      overlappingGroups.forEach((group) => {
        console.log(
          `[ScoreEngine] Merging ${group.length} documents:`,
          group.map((d) => d.title),
        );
        const merged = mergeDocuments(group, docs, anchorTerms);
        mergedDocs.push(merged);

        // Track which docs were merged
        group.forEach((doc) => mergedDocIds.add(doc.id));
      });

      // Keep non-merged documents and add merged ones
      const nonMergedDocs = relevantDocs.filter(
        (doc) => !mergedDocIds.has(doc.id),
      );
      relevantDocs = [...mergedDocs, ...nonMergedDocs] as ScoredResult[];

      // Re-sort by score
      relevantDocs.sort((a, b) => b.score - a.score);

      console.log(
        `[ScoreEngine] After merging: ${relevantDocs.length} documents (${mergedDocs.length} merged, ${nonMergedDocs.length} standalone)`,
      );
    }
  }

  // Determine maxResults (default 5)
  const maxResults = input.maxResults || 5;

  // Top matches: highest scoring results
  const topMatches = relevantDocs.slice(0, maxResults);

  // Related matches: next tier of results (if available)
  const relatedMatches = relevantDocs.slice(maxResults, maxResults + 3);

  console.log(
    `[ScoreEngine] Top matches:`,
    topMatches.map((m) => ({
      title: m.title,
      score: m.score,
      matchedOn: m.matchedOn,
    })),
  );

  if (relatedMatches.length > 0) {
    console.log(
      `[ScoreEngine] Related matches:`,
      relatedMatches.map((m) => ({
        title: m.title,
        score: m.score,
      })),
    );
  }

  return { topMatches, relatedMatches };
}
