import { MedicareSearchInput, normalizeInput } from "./medicareSearchTypes";

/**
 * Normalize text for comparison
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize text into words
 */
function tokenize(str: string): string[] {
  return normalize(str)
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/**
 * Calculate keyword overlap between two strings
 */
function keywordOverlap(str1: string, str2: string): number {
  const tokens1 = tokenize(str1);
  const tokens2 = tokenize(str2);

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set2 = new Set(tokens2);
  const matches = tokens1.filter((t) => set2.has(t));

  return matches.length / tokens1.length;
}

/**
 * Score a Medicare NCD document against search input
 */
export function scoreMedicareNCD(
  ncd: any,
  input: MedicareSearchInput
): { score: number; matchedOn: string[] } {
  const normalized = normalizeInput(input);
  let score = 0;
  const matchedOn: string[] = [];

  const title = ncd.title || "";
  const displayId = String(ncd.document_display_id || "").toLowerCase();
  const normQuery = normalize(input.query);

  // +10 for exact display ID match (e.g., "220.3")
  if (normQuery === displayId) {
    score += 10;
    matchedOn.push(`displayId:exact:${displayId}`);
  } else if (normQuery.includes(displayId) || displayId.includes(normQuery)) {
    score += 5;
    matchedOn.push(`displayId:partial:${displayId}`);
  }

  // +5 for exact title match
  const normTitle = normalize(title);
  if (normTitle === normQuery && normQuery.length > 0) {
    score += 5;
    matchedOn.push("title:exact");
  }

  // +3 for title substring match
  if (normTitle.includes(normQuery) && normQuery.length > 0 && score < 10) {
    score += 3;
    matchedOn.push("title:substring");
  }

  // +2 for query keyword overlap with title
  const titleOverlap = keywordOverlap(input.query, title);
  if (titleOverlap > 0.3) {
    score += 2;
    matchedOn.push(`title:overlap:${Math.round(titleOverlap * 100)}%`);
  }

  // +1 for any token match (fallback)
  if (score === 0) {
    const queryTokens = tokenize(input.query);
    if (queryTokens.some((t) => normTitle.includes(t))) {
      score += 1;
      matchedOn.push("title:token");
    }
  }

  return { score, matchedOn };
}

/**
 * Score a Medicare LCD document against search input
 */
export function scoreMedicareLCD(
  lcd: any,
  input: MedicareSearchInput
): { score: number; matchedOn: string[] } {
  const normalized = normalizeInput(input);
  let score = 0;
  const matchedOn: string[] = [];

  const title = lcd.title || "";
  const displayId = String(lcd.document_display_id || "").toLowerCase();
  const normQuery = normalize(input.query);
  const normTitle = normalize(title);

  // +10 for exact display ID match
  if (normQuery === displayId) {
    score += 10;
    matchedOn.push(`displayId:exact:${displayId}`);
  }

  // +5 for exact title match
  if (normTitle === normQuery && normQuery.length > 0) {
    score += 5;
    matchedOn.push("title:exact");
  }

  // +3 for title substring match
  if (normTitle.includes(normQuery) && normQuery.length > 0) {
    score += 3;
    matchedOn.push("title:substring");
  }

  // +2 for query keyword overlap with title
  const titleOverlap = keywordOverlap(input.query, title);
  if (titleOverlap > 0.3) {
    score += 2;
    matchedOn.push(`title:overlap:${Math.round(titleOverlap * 100)}%`);
  }

  // +2 for state match (LCD is state-specific)
  if (normalized.state && lcd.state_description) {
    const normState = normalize(normalized.state);
    const normLcdState = normalize(lcd.state_description);
    if (normLcdState.includes(normState) || normState.includes(normLcdState)) {
      score += 2;
      matchedOn.push(`state:${lcd.state_description}`);
    }
  }

  // +1 for treatment keyword overlap
  if (normalized.treatment) {
    const treatmentOverlap = keywordOverlap(normalized.treatment, title);
    if (treatmentOverlap > 0.4) {
      score += 1;
      matchedOn.push(`treatment:overlap:${Math.round(treatmentOverlap * 100)}%`);
    }
  }

  return { score, matchedOn };
}

/**
 * Score a Medicare LCA (Local Coverage Article) against search input
 */
export function scoreMedicareLCA(
  lca: any,
  input: MedicareSearchInput
): { score: number; matchedOn: string[] } {
  const normalized = normalizeInput(input);
  let score = 0;
  const matchedOn: string[] = [];

  const title = lca.title || "";
  const normQuery = normalize(input.query);
  const normTitle = normalize(title);

  // +5 for exact title match
  if (normTitle === normQuery && normQuery.length > 0) {
    score += 5;
    matchedOn.push("title:exact");
  }

  // +3 for title substring match
  if (normTitle.includes(normQuery) && normQuery.length > 0) {
    score += 3;
    matchedOn.push("title:substring");
  }

  // +2 for query keyword overlap with title
  const titleOverlap = keywordOverlap(input.query, title);
  if (titleOverlap > 0.3) {
    score += 2;
    matchedOn.push(`title:overlap:${Math.round(titleOverlap * 100)}%`);
  }

  // +2 for state match (LCA is state-specific)
  if (normalized.state && lca.state_description) {
    const normState = normalize(normalized.state);
    const normLcaState = normalize(lca.state_description);
    if (normLcaState.includes(normState) || normState.includes(normLcaState)) {
      score += 2;
      matchedOn.push(`state:${lca.state_description}`);
    }
  }

  // +1 for treatment keyword overlap
  if (normalized.treatment) {
    const treatmentOverlap = keywordOverlap(normalized.treatment, title);
    if (treatmentOverlap > 0.4) {
      score += 1;
      matchedOn.push(`treatment:overlap:${Math.round(treatmentOverlap * 100)}%`);
    }
  }

  return { score, matchedOn };
}
