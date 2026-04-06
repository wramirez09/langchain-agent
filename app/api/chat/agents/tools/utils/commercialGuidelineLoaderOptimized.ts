import { 
  loadMetadataIndex, 
  loadDocumentContent, 
  filterMetadataByQuery,
  DocumentMetadata 
} from "./commercialGuidelineMetadataIndex";
import { 
  CommercialGuidelineDoc,
  extractCPTCodes,
  extractICD10Codes,
  CommercialGuidelineSearchInput
} from "./commercialGuidelineTypes";

/**
 * Pre-load metadata index at module initialization
 * This is fast (~0.02-0.05s) compared to loading full documents
 */
const metadataIndex = loadMetadataIndex();

/**
 * Get metadata index (already loaded at module scope)
 */
export function getMetadataIndex(): DocumentMetadata[] {
  return metadataIndex;
}

/**
 * Load full document from metadata entry
 */
function loadFullDocument(metadata: DocumentMetadata): CommercialGuidelineDoc {
  // Load full content on-demand
  const bodyContent = loadDocumentContent(metadata.path);
  
  // Extract codes from body if not in metadata
  const contentCptCodes = extractCPTCodes(bodyContent);
  const contentIcd10Codes = extractICD10Codes(bodyContent);
  
  // Merge metadata codes with content-extracted codes
  const cptCodes = [...new Set([...(metadata.cptCodes || []), ...contentCptCodes])];
  const icd10Codes = [...new Set([...(metadata.icd10Codes || []), ...contentIcd10Codes])];
  
  return {
    id: metadata.id,
    title: metadata.title,
    treatment: metadata.title,
    domain: metadata.domain,
    sourceGroup: metadata.sourceGroup,
    sourceType: "commercial-guideline" as const,
    path: metadata.path,
    fileName: metadata.fileName,
    body: bodyContent,
    cptCodes,
    icd10Codes,
    tags: metadata.keywords || [],
    specialty: metadata.specialty,
    procedures: metadata.procedures,
    aliases: metadata.aliases,
    relatedConditions: metadata.relatedConditions,
    priority: metadata.priority as "high" | "medium" | "low" | undefined,
  };
}

/**
 * Smart document loading with metadata-based pre-filtering
 * Only loads full content for documents that match the query criteria
 */
export function loadRelevantDocuments(input: CommercialGuidelineSearchInput): CommercialGuidelineDoc[] {
  const startTime = Date.now();
  
  console.log(`[OptimizedLoader] Starting smart document loading for query:`, {
    query: input.query,
    treatment: input.treatment,
    cpt: input.cpt,
    icd10: input.icd10,
    domain: input.domain,
  });
  
  // Step 1: Fast metadata filtering
  const filteredMetadata = filterMetadataByQuery(metadataIndex, {
    domain: input.domain,
    cpt: Array.isArray(input.cpt) ? input.cpt.join(',') : input.cpt,
    icd10: Array.isArray(input.icd10) ? input.icd10.join(',') : input.icd10,
    treatment: input.treatment,
    diagnosis: input.diagnosis,
  });
  
  // Fallback: if no matches, use all documents (filtering was too strict)
  const candidateMetadata = filteredMetadata.length > 0 ? filteredMetadata : metadataIndex;
  
  console.log(`[OptimizedLoader] Filtered from ${metadataIndex.length} to ${candidateMetadata.length} candidates based on metadata`);
  
  // Step 2: Load full documents only for filtered candidates
  const fullDocs = candidateMetadata.map(metadata => loadFullDocument(metadata));
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[OptimizedLoader] Loaded ${fullDocs.length} full documents in ${elapsed}s`);
  
  return fullDocs;
}

/**
 * Fallback: Load all documents (for backward compatibility)
 * Use this only if no filtering criteria provided
 */
export function loadAllDocuments(): CommercialGuidelineDoc[] {
  const startTime = Date.now();
  console.log(`[OptimizedLoader] Loading all ${metadataIndex.length} documents (no filters provided)`);
  
  const fullDocs = metadataIndex.map(metadata => loadFullDocument(metadata));
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[OptimizedLoader] Loaded ${fullDocs.length} documents in ${elapsed}s`);
  
  return fullDocs;
}
