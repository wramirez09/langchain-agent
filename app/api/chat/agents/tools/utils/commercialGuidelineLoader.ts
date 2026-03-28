import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import path from "path";
import crypto from "crypto";
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
        
        // Infer metadata from filename and folder
        const domain = inferDomainFromFolder(folderName);
        const title = inferTitleFromFilename(fileName);
        const filenameKeywords = extractKeywordsFromFilename(fileName);
        
        // Extract codes from content
        const cptCodes = extractCPTCodes(doc.pageContent);
        const icd10Codes = extractICD10Codes(doc.pageContent);
        
        // Extract keywords from content
        const contentKeywords = extractContentKeywords(doc.pageContent);
        
        // Combine filename and content keywords
        const allTags = [...new Set([...filenameKeywords, ...contentKeywords])];
        
        return {
          id: generateDocId(filePath),
          title,
          treatment: title,
          domain,
          sourceGroup: folderName,
          sourceType: "commercial-guideline" as const,
          path: filePath,
          fileName,
          body: doc.pageContent,
          cptCodes,
          icd10Codes,
          tags: allTags,
        };
      });
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[CommercialGuidelineLoader] Loaded ${docs.length} documents in ${elapsed}s`);
      
      // Log sample for debugging
      if (docs.length > 0) {
        console.log(`[CommercialGuidelineLoader] Sample document:`, {
          id: docs[0].id,
          title: docs[0].title,
          domain: docs[0].domain,
          cptCodes: docs[0].cptCodes.slice(0, 3),
          icd10Codes: docs[0].icd10Codes.slice(0, 3),
          tags: docs[0].tags.slice(0, 5),
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
