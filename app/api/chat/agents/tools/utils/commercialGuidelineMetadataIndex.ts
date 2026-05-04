import fs from "fs";
import path from "path";
import matter from "gray-matter";
import crypto from "crypto";

/**
 * Lightweight metadata entry for fast filtering
 */
export interface DocumentMetadata {
  id: string;
  title: string;
  domain: string;
  path: string;
  fileName: string;
  specialty?: string[];
  procedures?: string[];
  aliases?: string[];
  relatedConditions?: string[];
  cptCodes?: string[];
  icd10Codes?: string[];
  keywords?: string[];
  priority?: string;
  payerNotes?: Record<string, string>;
  sourceGroup: string;
}

/**
 * Metadata index cache
 */
let metadataCache: DocumentMetadata[] | null = null;

/**
 * Generate unique ID from file path
 */
function generateDocId(filePath: string): string {
  return crypto.createHash("md5").update(filePath).digest("hex").substring(0, 12);
}

/**
 * Recursively scan directory and extract only YAML front matter
 * This is much faster than loading full document content
 */
function scanDirectoryForMetadata(dir: string): DocumentMetadata[] {
  const results: DocumentMetadata[] = [];
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    
    if (item.isDirectory()) {
      // Recursively scan subdirectories
      results.push(...scanDirectoryForMetadata(fullPath));
    } else if (item.isFile() && (item.name.endsWith('.md') || item.name.endsWith('.txt'))) {
      try {
        // Read only the first 2KB to extract front matter (much faster than full file)
        const fd = fs.openSync(fullPath, 'r');
        const buffer = Buffer.alloc(2048);
        const bytesRead = fs.readSync(fd, buffer, 0, 2048, 0);
        fs.closeSync(fd);
        
        const content = buffer.toString('utf8', 0, bytesRead);
        
        // Parse YAML front matter
        let frontMatter: Record<string, unknown> = {};
        if (item.name.endsWith('.md')) {
          try {
            const parsed = matter(content);
            frontMatter = parsed.data;
          } catch {
            // No front matter or invalid, skip
            console.warn(`[MetadataIndex] No front matter in ${item.name}`);
          }
        }
        
        const folderName = path.basename(path.dirname(fullPath));
        
        // Build metadata entry
        const metadata: DocumentMetadata = {
          id: generateDocId(fullPath),
          title: (frontMatter.title as string) || item.name.replace(/\.(md|txt)$/, ''),
          domain: (frontMatter.domain as string) || folderName,
          path: fullPath,
          fileName: item.name,
          sourceGroup: folderName,
        };
        
        // Add optional fields if present
        if (frontMatter.specialty) {
          metadata.specialty = Array.isArray(frontMatter.specialty) ? frontMatter.specialty : [frontMatter.specialty];
        }
        if (frontMatter.procedures) {
          metadata.procedures = Array.isArray(frontMatter.procedures) ? frontMatter.procedures : [frontMatter.procedures];
        }
        if (frontMatter.aliases) {
          metadata.aliases = Array.isArray(frontMatter.aliases) ? frontMatter.aliases : [frontMatter.aliases];
        }
        if (frontMatter.relatedConditions || frontMatter.related_conditions) {
          const conditions = frontMatter.relatedConditions || frontMatter.related_conditions;
          metadata.relatedConditions = Array.isArray(conditions) ? conditions : [conditions];
        }
        if (frontMatter.cpt_codes || frontMatter.cptCodes) {
          const codes = frontMatter.cpt_codes || frontMatter.cptCodes;
          metadata.cptCodes = Array.isArray(codes) ? codes : [codes];
        }
        if (frontMatter.icd10_codes || frontMatter.icd10Codes) {
          const codes = frontMatter.icd10_codes || frontMatter.icd10Codes;
          metadata.icd10Codes = Array.isArray(codes) ? codes : [codes];
        }
        if (frontMatter.keywords) {
          metadata.keywords = Array.isArray(frontMatter.keywords) ? frontMatter.keywords : [frontMatter.keywords];
        }
        if (frontMatter.priority) {
          metadata.priority = frontMatter.priority as string;
        }
        const payerNotesRaw =
          (frontMatter.payerNotes as unknown) ??
          (frontMatter.payer_notes as unknown);
        if (payerNotesRaw && typeof payerNotesRaw === "object" && !Array.isArray(payerNotesRaw)) {
          metadata.payerNotes = payerNotesRaw as Record<string, string>;
        }

        results.push(metadata);
      } catch (error) {
        console.error(`[MetadataIndex] Error reading ${fullPath}:`, error);
      }
    }
  }
  
  return results;
}

/**
 * Load metadata index (fast - only YAML front matter, not full content)
 * This runs once at module initialization
 */
export function loadMetadataIndex(): DocumentMetadata[] {
  if (metadataCache) {
    return metadataCache;
  }
  
  const startTime = Date.now();
  const dataDir = path.join(process.cwd(), "app", "api", "data");
  
  console.log(`[MetadataIndex] Scanning directory for metadata: ${dataDir}`);
  
  const metadata = scanDirectoryForMetadata(dataDir);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[MetadataIndex] Indexed ${metadata.length} documents in ${elapsed}s`);
  
  metadataCache = metadata;
  return metadata;
}

/**
 * Load full document content on-demand
 */
export function loadDocumentContent(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse and return body without front matter
    if (filePath.endsWith('.md')) {
      const parsed = matter(content);
      return parsed.content;
    }
    
    return content;
  } catch (error) {
    console.error(`[MetadataIndex] Error loading document ${filePath}:`, error);
    return '';
  }
}

/**
 * Filter metadata by query criteria (fast pre-filtering)
 */
export function filterMetadataByQuery(
  metadata: DocumentMetadata[],
  query: {
    domain?: string;
    cpt?: string;
    icd10?: string;
    keywords?: string[];
    treatment?: string;
    diagnosis?: string;
  }
): DocumentMetadata[] {
  let filtered = metadata;
  
  // Domain filter
  if (query.domain) {
    const domainLower = query.domain.toLowerCase();
    filtered = filtered.filter(m => 
      m.domain.toLowerCase().includes(domainLower) ||
      m.sourceGroup.toLowerCase().includes(domainLower)
    );
  }
  
  // CPT code exact match
  if (query.cpt && query.cpt.trim()) {
    const cptCodes = query.cpt.split(/[,\s]+/).map(c => c.trim()).filter(Boolean);
    filtered = filtered.filter(m => 
      m.cptCodes?.some(code => cptCodes.includes(code))
    );
  }
  
  // ICD-10 code exact match
  if (query.icd10 && query.icd10.trim()) {
    const icd10Codes = query.icd10.split(/[,\s]+/).map(c => c.trim()).filter(Boolean);
    filtered = filtered.filter(m => 
      m.icd10Codes?.some(code => icd10Codes.includes(code))
    );
  }
  
  // Treatment/procedure matching
  if (query.treatment) {
    const treatmentLower = query.treatment.toLowerCase();
    filtered = filtered.filter(m => 
      m.title.toLowerCase().includes(treatmentLower) ||
      m.procedures?.some(p => p.toLowerCase().includes(treatmentLower)) ||
      m.aliases?.some(a => a.toLowerCase().includes(treatmentLower))
    );
  }
  
  // Diagnosis/condition matching
  if (query.diagnosis) {
    const diagnosisLower = query.diagnosis.toLowerCase();
    filtered = filtered.filter(m => 
      m.relatedConditions?.some(c => c.toLowerCase().includes(diagnosisLower)) ||
      m.title.toLowerCase().includes(diagnosisLower)
    );
  }
  
  return filtered;
}

/**
 * Reset cache (for testing)
 */
export function resetMetadataCache() {
  metadataCache = null;
}
