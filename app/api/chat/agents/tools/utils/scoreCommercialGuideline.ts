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
  
  // +5 for specialty match (from front matter)
  if (doc.specialty && doc.specialty.length > 0) {
    const queryTokens = tokenize(input.query);
    const treatmentTokens = input.treatment ? tokenize(input.treatment) : [];
    const allInputTokens = [...queryTokens, ...treatmentTokens];
    
    const matchingSpecialties = doc.specialty.filter(spec =>
      allInputTokens.some(token => normalize(spec).includes(token) || token.includes(normalize(spec)))
    );
    
    if (matchingSpecialties.length > 0) {
      score += matchingSpecialties.length * 5;
      matchedOn.push(`specialty:${matchingSpecialties.join(",")}`);
    }
  }
  
  // +8 for procedure match (from front matter)
  if (doc.procedures && doc.procedures.length > 0) {
    const queryTokens = tokenize(input.query);
    const treatmentTokens = input.treatment ? tokenize(input.treatment) : [];
    const allInputTokens = [...queryTokens, ...treatmentTokens];
    
    const matchingProcedures = doc.procedures.filter(proc => {
      const procNorm = normalize(proc);
      return allInputTokens.some(token => procNorm.includes(token) || token.includes(procNorm)) ||
             (input.treatment && keywordOverlap(proc, input.treatment) > 0.5);
    });
    
    if (matchingProcedures.length > 0) {
      score += matchingProcedures.length * 8;
      matchedOn.push(`procedures:${matchingProcedures.join(",")}`);
    }
  }
  
  // +6 for alias match (from front matter)
  if (doc.aliases && doc.aliases.length > 0) {
    const treatmentNorm = input.treatment ? normalize(input.treatment) : "";
    const queryNorm = normalize(input.query);
    
    const matchingAliases = doc.aliases.filter(alias => {
      const aliasNorm = normalize(alias);
      return (treatmentNorm && aliasNorm.includes(treatmentNorm)) ||
             (treatmentNorm && treatmentNorm.includes(aliasNorm)) ||
             queryNorm.includes(aliasNorm) ||
             aliasNorm.includes(queryNorm);
    });
    
    if (matchingAliases.length > 0) {
      score += matchingAliases.length * 6;
      matchedOn.push(`aliases:${matchingAliases.join(",")}`);
    }
  }
  
  // +4 for related condition match (from front matter)
  if (doc.relatedConditions && doc.relatedConditions.length > 0 && input.diagnosis) {
    const diagnosisNorm = normalize(input.diagnosis);
    const diagnosis = input.diagnosis; // Type guard for closure
    
    const matchingConditions = doc.relatedConditions.filter(condition => {
      const conditionNorm = normalize(condition);
      return diagnosisNorm.includes(conditionNorm) ||
             conditionNorm.includes(diagnosisNorm) ||
             keywordOverlap(condition, diagnosis) > 0.4;
    });
    
    if (matchingConditions.length > 0) {
      score += matchingConditions.length * 4;
      matchedOn.push(`relatedConditions:${matchingConditions.join(",")}`);
    }
  }
  
  // +3 for payer-specific notes match (from front matter)
  if (doc.payerNotes && input.payer) {
    const payerNorm = normalize(input.payer);
    const matchingPayers = Object.keys(doc.payerNotes).filter(payer =>
      normalize(payer).includes(payerNorm) || payerNorm.includes(normalize(payer))
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
