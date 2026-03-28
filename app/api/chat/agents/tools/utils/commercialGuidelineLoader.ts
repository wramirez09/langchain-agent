import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import path from "path";
import {
  inferDomainFromFolder,
  inferTitleFromFilename,
  extractCPTCodes,
  extractICD10Codes,
  extractKeywordsFromFilename,
} from "./commercialGuidelineTypes";

/**
 * Load commercial guideline documents from the local filesystem
 * using LangChain's DirectoryLoader and TextLoader.
 * 
 * Documents are loaded from app/api/data/ and enriched with metadata
 * inferred from filename and folder structure.
 */
export async function loadCommercialGuidelines(): Promise<Document[]> {
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
    
    // Enrich documents with metadata inferred from path and filename
    const enrichedDocs = rawDocs.map((doc) => {
      const filePath = doc.metadata.source as string;
      const fileName = path.basename(filePath);
      const folderName = path.basename(path.dirname(filePath));
      
      // Infer metadata
      const domain = inferDomainFromFolder(folderName);
      const title = inferTitleFromFilename(fileName);
      const keywords = extractKeywordsFromFilename(fileName);
      
      // Extract codes from content
      const cptCodes = extractCPTCodes(doc.pageContent);
      const icd10Codes = extractICD10Codes(doc.pageContent);
      
      // Create enriched metadata
      const enrichedMetadata = {
        ...doc.metadata,
        domain,
        sourceGroup: folderName,
        title,
        treatment: title, // Use title as treatment name
        fileName,
        keywords: keywords.join(", "),
        cptCodes: cptCodes.join(", "),
        icd10Codes: icd10Codes.join(", "),
        sourceType: "commercial-guideline",
      };
      
      return new Document({
        pageContent: doc.pageContent,
        metadata: enrichedMetadata,
      });
    });
    
    console.log(`[CommercialGuidelineLoader] Enriched ${enrichedDocs.length} documents with metadata`);
    
    // Split documents into chunks for better retrieval
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const splitDocs = await textSplitter.splitDocuments(enrichedDocs);
    console.log(`[CommercialGuidelineLoader] Split into ${splitDocs.length} chunks`);
    
    // Log sample metadata for debugging
    if (splitDocs.length > 0) {
      console.log(`[CommercialGuidelineLoader] Sample metadata:`, {
        domain: splitDocs[0].metadata.domain,
        title: splitDocs[0].metadata.title,
        sourceGroup: splitDocs[0].metadata.sourceGroup,
      });
    }
    
    return splitDocs;
  } catch (error) {
    console.error("[CommercialGuidelineLoader] Error loading documents:", error);
    throw error;
  }
}

/**
 * Filter documents by domain if specified
 */
export function filterByDomain(docs: Document[], domain?: string): Document[] {
  if (!domain) return docs;
  
  const normalizedDomain = domain.toLowerCase();
  return docs.filter(doc => 
    doc.metadata.domain?.toLowerCase() === normalizedDomain
  );
}

/**
 * Filter documents by CPT code if specified
 */
export function filterByCPT(docs: Document[], cpt?: string): Document[] {
  if (!cpt) return docs;
  
  return docs.filter(doc => {
    const cptCodes = doc.metadata.cptCodes as string;
    return cptCodes?.includes(cpt);
  });
}

/**
 * Filter documents by ICD-10 code if specified
 */
export function filterByICD10(docs: Document[], icd10?: string): Document[] {
  if (!icd10) return docs;
  
  const normalizedICD10 = icd10.toUpperCase();
  return docs.filter(doc => {
    const icd10Codes = doc.metadata.icd10Codes as string;
    return icd10Codes?.includes(normalizedICD10);
  });
}
