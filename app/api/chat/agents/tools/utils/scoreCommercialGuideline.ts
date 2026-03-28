import { CommercialGuidelineDoc, CommercialGuidelineSearchInput } from "./commercialGuidelineTypes";

export interface ScoredResult {
  id: string;
  title: string;
  score: number;
  domain: string;
  matchedOn: string[];
  excerpt: string;
  path: string;
  treatment?: string;
  cptCodes?: string[];
  icd10Codes?: string[];
}

/**
 * Normalize a string for comparison: lowercase, trim, remove extra spaces
 */
function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Tokenize a string into keywords (split on spaces, remove short words)
 */
function tokenize(str: string): string[] {
  return normalize(str)
    .split(/\s+/)
    .filter(word => word.length > 2);
}

/**
 * Calculate keyword overlap percentage between two strings
 */
function keywordOverlap(str1: string, str2: string): number {
  const tokens1 = new Set(tokenize(str1));
  const tokens2 = new Set(tokenize(str2));
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  return intersection.size / Math.min(tokens1.size, tokens2.size);
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
          matrix[i - 1][j] + 1
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
  return 1 - (distance / maxLen);
}

/**
 * Score a commercial guideline document against search input
 * Returns score and list of matched signals
 */
export function scoreCommercialGuideline(
  doc: CommercialGuidelineDoc,
  input: CommercialGuidelineSearchInput
): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];
  
  // Normalize input CPT codes (handle both string and array)
  const inputCptCodes = input.cpt 
    ? (Array.isArray(input.cpt) ? input.cpt : [input.cpt])
    : [];
  
  // Normalize input ICD-10 codes (handle both string and array)
  const inputIcd10Codes = input.icd10
    ? (Array.isArray(input.icd10) ? input.icd10 : [input.icd10])
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
      if (doc.icd10Codes.some(code => code.toUpperCase() === normalizedInput)) {
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
  
  // +2 for domain match
  if (input.domain && doc.domain) {
    if (normalize(input.domain) === normalize(doc.domain)) {
      score += 2;
      matchedOn.push(`domain:${doc.domain}`);
    }
  }
  
  // +2 for state match (if applicable)
  if (input.state && doc.body) {
    const normalizedState = normalize(input.state);
    if (normalize(doc.body).includes(normalizedState)) {
      score += 2;
      matchedOn.push(`state:${input.state}`);
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
  
  // Tag matching (keywords from filename)
  if (input.query && doc.tags) {
    const queryTokens = tokenize(input.query);
    const matchingTags = doc.tags.filter(tag => 
      queryTokens.some(token => tag.includes(token) || token.includes(tag))
    );
    if (matchingTags.length > 0) {
      score += matchingTags.length;
      matchedOn.push(`tags:${matchingTags.join(",")}`);
    }
  }
  
  return { score, matchedOn };
}

/**
 * Score and rank all documents, returning top and related matches
 */
export function scoreAndRankDocuments(
  docs: CommercialGuidelineDoc[],
  input: CommercialGuidelineSearchInput
): { topMatches: ScoredResult[]; relatedMatches: ScoredResult[] } {
  console.log(`[ScoreEngine] Scoring ${docs.length} documents against input:`, {
    query: input.query,
    treatment: input.treatment,
    diagnosis: input.diagnosis,
    cpt: input.cpt,
    icd10: input.icd10,
    domain: input.domain,
  });
  
  // Score all documents
  const scoredDocs = docs.map(doc => {
    const { score, matchedOn } = scoreCommercialGuideline(doc, input);
    
    return {
      id: doc.id,
      title: doc.title,
      score,
      domain: doc.domain,
      matchedOn,
      excerpt: doc.body.substring(0, 300).trim() + "...",
      path: doc.path,
      treatment: doc.treatment,
      cptCodes: doc.cptCodes,
      icd10Codes: doc.icd10Codes,
    };
  });
  
  // Sort by score descending
  scoredDocs.sort((a, b) => b.score - a.score);
  
  // Filter out zero-score results
  const relevantDocs = scoredDocs.filter(doc => doc.score > 0);
  
  console.log(`[ScoreEngine] Found ${relevantDocs.length} relevant documents`);
  
  // Determine maxResults (default 5)
  const maxResults = input.maxResults || 5;
  
  // Top matches: highest scoring results
  const topMatches = relevantDocs.slice(0, maxResults);
  
  // Related matches: next tier of results (if available)
  const relatedMatches = relevantDocs.slice(maxResults, maxResults + 3);
  
  console.log(`[ScoreEngine] Top matches:`, topMatches.map(m => ({
    title: m.title,
    score: m.score,
    matchedOn: m.matchedOn,
  })));
  
  if (relatedMatches.length > 0) {
    console.log(`[ScoreEngine] Related matches:`, relatedMatches.map(m => ({
      title: m.title,
      score: m.score,
    })));
  }
  
  return { topMatches, relatedMatches };
}
