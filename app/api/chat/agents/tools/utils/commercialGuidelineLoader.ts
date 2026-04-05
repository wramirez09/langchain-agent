import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import path from "path";
import crypto from "crypto";
import matter from "gray-matter";
import {
  CommercialGuidelineDoc,
  inferDomainFromFolder,
  inferTitleFromFilename,
  extractCPTCodes,
  extractICD10Codes,
  extractKeywordsFromFilename,
} from "./commercialGuidelineTypes";

/**
 * Extract keywords from document content (not just filename)
 */
function extractContentKeywords(content: string): string[] {
  // Remove common medical terms that don't add value
  const stopWords = new Set([
    "the", "and", "or", "for", "with", "patient", "treatment", "medical",
    "procedure", "diagnosis", "criteria", "required", "documentation"
  ]);
  
  // Tokenize content, filter stop words and short words
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  // Count frequency
  const wordCounts = new Map<string, number>();
  words.forEach(word => {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  });
  
  // Get top 20 most frequent words
  const topWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
  
  return topWords;
}

/**
 * Generate unique ID from file path
 */
function generateDocId(filePath: string): string {
  return crypto.createHash("md5").update(filePath).digest("hex").substring(0, 12);
}

/**
 * Singleton cache for loaded documents
 */
let docsCache: CommercialGuidelineDoc[] | null = null;
let isLoading = false;
let loadPromise: Promise<CommercialGuidelineDoc[]> | null = null;

/**
 * Load commercial guideline documents from the local filesystem.
 * 
 * Documents are loaded as full files (no chunking) and enriched with metadata
 * inferred from filename, folder structure, and content analysis.
 * 
 * Uses singleton caching to avoid reloading on every request.
 */
export async function loadCommercialGuidelines(): Promise<CommercialGuidelineDoc[]> {
  // Return cached instance if available
  if (docsCache) {
    console.log("[CommercialGuidelineLoader] Using cached documents");
    return docsCache;
  }
  
  // If already loading, wait for that to complete
  if (isLoading && loadPromise) {
    console.log("[CommercialGuidelineLoader] Waiting for ongoing load");
    return loadPromise;
  }
  
  // Start loading
  isLoading = true;
  console.log("[CommercialGuidelineLoader] Starting document load...");
  
  loadPromise = (async () => {
    const startTime = Date.now();
    const dataDir = path.join(process.cwd(), "app", "api", "data");
    
    console.log(`[CommercialGuidelineLoader] Loading documents from: ${dataDir}`);
    
    try {
      // Configure DirectoryLoader to load .md and .txt files
      const loader = new DirectoryLoader(
        dataDir,
        {
          ".md": (filePath: string) => new TextLoader(filePath),
          ".txt": (filePath: string) => new TextLoader(filePath),
        }
      );
      
      // Load all documents
      const rawDocs = await loader.load();
      console.log(`[CommercialGuidelineLoader] Loaded ${rawDocs.length} raw documents`);
      
      // Transform to CommercialGuidelineDoc format (no chunking)
      const docs: CommercialGuidelineDoc[] = rawDocs.map((doc) => {
        const filePath = doc.metadata.source as string;
        const fileName = path.basename(filePath);
        const folderName = path.basename(path.dirname(filePath));
        
        // Parse YAML front matter if present (only for .md files)
        let frontMatter: Record<string, any> = {};
        let bodyContent = doc.pageContent;
        
        if (fileName.endsWith('.md')) {
          try {
            const parsed = matter(doc.pageContent);
            frontMatter = parsed.data;
            bodyContent = parsed.content; // Content without front matter
          } catch (error) {
            console.warn(`[CommercialGuidelineLoader] Failed to parse front matter for ${fileName}:`, error);
            // Fall back to using full content if parsing fails
          }
        }
        
        // Infer metadata from filename and folder (used as fallback)
        const inferredDomain = inferDomainFromFolder(folderName);
        const inferredTitle = inferTitleFromFilename(fileName);
        const filenameKeywords = extractKeywordsFromFilename(fileName);
        
        // Extract codes from content (body without front matter)
        const contentCptCodes = extractCPTCodes(bodyContent);
        const contentIcd10Codes = extractICD10Codes(bodyContent);
        
        // Extract keywords from content
        const contentKeywords = extractContentKeywords(bodyContent);
        
        // Merge front matter with auto-extracted metadata
        // Front matter takes precedence when present
        const title = frontMatter.title || inferredTitle;
        const domain = frontMatter.domain || inferredDomain;
        
        // Combine CPT codes from front matter and content
        const frontMatterCptCodes = frontMatter.cpt_codes || frontMatter.cptCodes || [];
        const cptCodes = [...new Set([...frontMatterCptCodes, ...contentCptCodes])];
        
        // Combine ICD-10 codes from front matter and content
        const frontMatterIcd10Codes = frontMatter.icd10_codes || frontMatter.icd10Codes || [];
        const icd10Codes = [...new Set([...frontMatterIcd10Codes, ...contentIcd10Codes])];
        
        // Combine keywords from front matter, filename, and content
        const frontMatterKeywords = frontMatter.keywords || [];
        const allTags = [...new Set([...frontMatterKeywords, ...filenameKeywords, ...contentKeywords])];
        
        // Build the document with all metadata
        const docData: CommercialGuidelineDoc = {
          id: generateDocId(filePath),
          title,
          treatment: title,
          domain,
          sourceGroup: folderName,
          sourceType: "commercial-guideline" as const,
          path: filePath,
          fileName,
          body: bodyContent, // Use content without front matter
          cptCodes,
          icd10Codes,
          tags: allTags,
        };
        
        // Add optional front matter fields if present
        if (frontMatter.specialty) {
          docData.specialty = Array.isArray(frontMatter.specialty) ? frontMatter.specialty : [frontMatter.specialty];
        }
        if (frontMatter.procedures) {
          docData.procedures = Array.isArray(frontMatter.procedures) ? frontMatter.procedures : [frontMatter.procedures];
        }
        if (frontMatter.aliases) {
          docData.aliases = Array.isArray(frontMatter.aliases) ? frontMatter.aliases : [frontMatter.aliases];
        }
        if (frontMatter.relatedConditions || frontMatter.related_conditions) {
          const conditions = frontMatter.relatedConditions || frontMatter.related_conditions;
          docData.relatedConditions = Array.isArray(conditions) ? conditions : [conditions];
        }
        if (frontMatter.ageRestrictions || frontMatter.age_restrictions) {
          docData.ageRestrictions = frontMatter.ageRestrictions || frontMatter.age_restrictions;
        }
        if (frontMatter.payerNotes || frontMatter.payer_notes) {
          docData.payerNotes = frontMatter.payerNotes || frontMatter.payer_notes;
        }
        if (frontMatter.lastUpdated || frontMatter.last_updated) {
          docData.lastUpdated = frontMatter.lastUpdated || frontMatter.last_updated;
        }
        if (frontMatter.priority) {
          docData.priority = frontMatter.priority;
        }
        
        return docData;
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[CommercialGuidelineLoader] Loaded ${docs.length} documents in ${elapsed}s`);
      
      // Log sample for debugging
      if (docs.length > 0) {
        const sample = docs[0];
        console.log(`[CommercialGuidelineLoader] Sample document:`, {
          id: sample.id,
          title: sample.title,
          domain: sample.domain,
          cptCodes: sample.cptCodes.slice(0, 3),
          icd10Codes: sample.icd10Codes.slice(0, 3),
          tags: sample.tags.slice(0, 5),
          hasSpecialty: !!sample.specialty,
          hasProcedures: !!sample.procedures,
          hasAliases: !!sample.aliases,
          priority: sample.priority,
        });
      }
      
      // Cache the results
      docsCache = docs;
      return docs;
    } catch (error) {
      console.error("[CommercialGuidelineLoader] Error loading documents:", error);
      throw error;
    } finally {
      isLoading = false;
      loadPromise = null;
    }
  })();
  
  return loadPromise;
}

/**
 * Reset the document cache (useful for testing or if documents are updated)
 */
export function resetDocumentCache() {
  console.log("[CommercialGuidelineLoader] Resetting document cache");
  docsCache = null;
  isLoading = false;
  loadPromise = null;
}
