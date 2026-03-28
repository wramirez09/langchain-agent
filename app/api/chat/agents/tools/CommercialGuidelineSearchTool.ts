import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrieverTool } from "langchain/tools/retriever";
import { Document } from "@langchain/core/documents";
import { loadCommercialGuidelines } from "./utils/commercialGuidelineLoader";

/**
 * Singleton vector store instance for commercial guidelines.
 * Initialized lazily on first use and cached for subsequent requests.
 */
let vectorStoreInstance: MemoryVectorStore | null = null;
let isInitializing = false;
let initializationPromise: Promise<MemoryVectorStore> | null = null;

/**
 * Initialize the vector store with commercial guideline documents.
 * Uses lazy initialization and caching to avoid reloading on every request.
 */
async function getVectorStore(): Promise<MemoryVectorStore> {
  // Return cached instance if available
  if (vectorStoreInstance) {
    console.log("[CommercialGuidelineSearchTool] Using cached vector store");
    return vectorStoreInstance;
  }
  
  // If already initializing, wait for that to complete
  if (isInitializing && initializationPromise) {
    console.log("[CommercialGuidelineSearchTool] Waiting for ongoing initialization");
    return initializationPromise;
  }
  
  // Start initialization
  isInitializing = true;
  console.log("[CommercialGuidelineSearchTool] Initializing vector store...");
  
  initializationPromise = (async () => {
    try {
      const startTime = Date.now();
      
      // Load documents from filesystem
      const documents = await loadCommercialGuidelines();
      
      if (documents.length === 0) {
        console.warn("[CommercialGuidelineSearchTool] No documents found in app/api/data/");
        throw new Error("No commercial guideline documents found. Please ensure markdown files exist in app/api/data/");
      }
      
      // Create embeddings
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
      
      // Create vector store from documents
      const vectorStore = await MemoryVectorStore.fromDocuments(
        documents,
        embeddings
      );
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[CommercialGuidelineSearchTool] Vector store initialized in ${elapsed}s with ${documents.length} document chunks`);
      
      vectorStoreInstance = vectorStore;
      return vectorStore;
    } catch (error) {
      console.error("[CommercialGuidelineSearchTool] Failed to initialize vector store:", error);
      throw error;
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  })();
  
  return initializationPromise;
}

/**
 * Create a retriever with optional metadata filtering.
 * 
 * @param domain - Optional domain filter (e.g., "cardio", "genetic")
 * @param k - Number of results to return (default: 5)
 */
async function createFilteredRetriever(domain?: string, k: number = 5) {
  const vectorStore = await getVectorStore();
  
  // Create retriever with metadata filtering if domain is specified
  if (domain) {
    const normalizedDomain = domain.toLowerCase();
    console.log(`[CommercialGuidelineSearchTool] Creating retriever with domain filter: ${normalizedDomain}`);
    
    return vectorStore.asRetriever({
      k,
      filter: (doc: Document) => {
        return doc.metadata.domain?.toLowerCase() === normalizedDomain;
      },
    });
  }
  
  // No filtering - return all results
  return vectorStore.asRetriever({ k });
}

/**
 * Commercial Guideline Search Tool
 * 
 * Uses LangChain's MemoryVectorStore with OpenAI embeddings for semantic search
 * across local commercial guideline documents.
 * 
 * Features:
 * - Semantic similarity search (finds related treatments automatically)
 * - Metadata filtering by domain (cardio, genetic, etc.)
 * - Inferred metadata from filename and folder structure
 * - Lazy initialization with caching
 */
export async function createCommercialGuidelineSearchTool() {
  // Ensure vector store is initialized
  await getVectorStore();
  
  // Create a default retriever (no domain filter, top 5 results)
  const retriever = await createFilteredRetriever(undefined, 5);
  
  // Wrap retriever as a tool using LangChain's createRetrieverTool
  const tool = createRetrieverTool(retriever, {
    name: "commercial_guidelines_search",
    description: `Search commercial guidelines for prior authorization requirements.
    
This tool performs semantic search across commercial guideline documents to find relevant authorization criteria.

Use this tool when:
- The user asks about commercial insurance authorization requirements
- The query mentions treatments, procedures, or diagnoses
- You need to find coverage criteria for commercial payers

The tool automatically:
- Finds semantically similar treatments (e.g., "spine imaging" matches "MRI lumbar spine")
- Detects related procedures in the same domain
- Matches synonyms and related terminology
- Returns the most relevant guideline excerpts

Input should be a natural language query describing the treatment, procedure, or diagnosis.
Examples:
- "MRI lumbar spine authorization requirements"
- "cardiac imaging prior auth criteria"
- "genetic testing coverage guidelines"

IMPORTANT: Never mention specific data sources, tool names, URLs, or document references in your response.
Use only generic terms like "commercial guidelines" or "industry standards".`,
  });
  
  return tool;
}

/**
 * Create a domain-specific retriever tool
 * Useful if you need to create multiple tools with different domain filters
 */
export async function createDomainSpecificTool(domain: string, k: number = 5) {
  const retriever = await createFilteredRetriever(domain, k);
  
  return createRetrieverTool(retriever, {
    name: `commercial_guidelines_search_${domain}`,
    description: `Search ${domain} commercial guidelines for prior authorization requirements.
    
This tool searches specifically within ${domain} domain guidelines.
Input should be a treatment, procedure, or diagnosis query.`,
  });
}

/**
 * Reset the vector store cache (useful for testing or if documents are updated)
 */
export function resetVectorStore() {
  console.log("[CommercialGuidelineSearchTool] Resetting vector store cache");
  vectorStoreInstance = null;
  isInitializing = false;
  initializationPromise = null;
}
