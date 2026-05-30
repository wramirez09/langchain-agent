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

// Maps the agent's loose domain vocabulary onto the corpus's actual domain /
// folder values. The agent emits e.g. "musculoskeletal" / "msk" / "ortho",
// but the corpus uses "muscle", "orthopedics", "physical-medicine", etc. —
// without this the domain filter silently matches nothing and the correct
// docs get excluded. Each canonical key lists every synonym we accept.
const DOMAIN_SYNONYMS: Record<string, string[]> = {
  muscle: [
    'muscle', 'musculoskeletal', 'msk', 'ortho', 'orthopedic', 'orthopedics',
    'spine', 'spinal', 'physical-medicine', 'physical medicine',
    'pain-management', 'pain management',
  ],
  cardio: ['cardio', 'cardiac', 'cardiology', 'cardiovascular', 'heart'],
  imaging: ['imaging', 'radiology', 'radiologic'],
  genetic: ['genetic', 'genetics', 'genomic', 'genomics'],
  oncology: ['oncology', 'cancer', 'radiation-oncology', 'radiation oncology'],
  sleep: ['sleep', 'sleep-medicine', 'sleep medicine'],
}

// Expand a query domain into every accepted synonym so matching works against
// the corpus's vocabulary. Unknown domains pass through as-is.
function expandDomain(domain: string): string[] {
  const d = domain.toLowerCase().trim()
  for (const [canonical, syns] of Object.entries(DOMAIN_SYNONYMS)) {
    if (canonical === d || syns.some((s) => s === d || d.includes(s) || s.includes(d))) {
      return [canonical, ...syns]
    }
  }
  return [d]
}

// English + clinical filler words, plus spinal-level designators (c2, c4-c5,
// l4-l5, s1) that carry no document-matching signal. A multi-word treatment
// like "C2 to C3 and C4 to C5 laminectomy" must reduce to the keyword
// "laminectomy" so it matches a doc whose procedures list "laminectomy".
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'without', 'of', 'to', 'in', 'on', 'at', 'or',
  'a', 'an', 'pain', 'disorder', 'disease', 'syndrome', 'chronic', 'acute',
  'level', 'levels', 'procedure', 'surgery', 'left', 'right', 'bilateral',
])
const LEVEL_RE = /^[clts]\d+$/i // c2, c5, l4, t12, s1

function tokenize(...parts: (string | undefined)[]): Set<string> {
  return new Set(
    parts
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !LEVEL_RE.test(t)),
  )
}

const overlaps = (a: Set<string>, b: Set<string>): number => {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

/**
 * Filter metadata by query criteria (fast pre-filtering).
 *
 * Recall-oriented: returns every doc that shares any signal with the query
 * (domain, exact code, or a shared treatment/diagnosis token), ranked by how
 * many signals matched. The downstream ScoreEngine does the precise ranking.
 *
 * Two deliberate behaviors:
 *  - No criteria at all → return everything (nothing to narrow on).
 *  - Criteria provided but nothing matches → return empty (let the caller
 *    decide whether to fall back), rather than silently matching all.
 *
 * This replaces the previous AND-chained, whole-phrase `includes()` filter
 * which zeroed out on any over-specific term (e.g. a full "C2 to C3..."
 * treatment string never substring-matched a doc title), forcing a fallback
 * to all 58 docs and letting unrelated specialties contaminate results.
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
  const cptCodes =
    query.cpt && query.cpt.trim()
      ? query.cpt.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean)
      : [];
  const icd10Codes =
    query.icd10 && query.icd10.trim()
      ? query.icd10.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean)
      : [];

  const hasCriteria =
    !!query.domain ||
    cptCodes.length > 0 ||
    icd10Codes.length > 0 ||
    !!query.treatment ||
    !!query.diagnosis ||
    (query.keywords?.length ?? 0) > 0;

  // No criteria to narrow on → return everything.
  if (!hasCriteria) return metadata;

  const domains = query.domain ? expandDomain(query.domain) : [];
  // Treatment/keywords drive procedure/title/alias matching; diagnosis drives
  // related-condition matching.
  const procTokens = tokenize(query.treatment, (query.keywords ?? []).join(' '));
  const diagTokens = tokenize(query.diagnosis);

  const scored = metadata.map((m) => {
    let score = 0;

    if (domains.length) {
      const dom = m.domain.toLowerCase();
      const grp = m.sourceGroup.toLowerCase();
      if (domains.some((d) => dom.includes(d) || grp.includes(d))) score += 3;
    }
    if (cptCodes.length && m.cptCodes?.some((c) => cptCodes.includes(c))) score += 5;
    if (icd10Codes.length && m.icd10Codes?.some((c) => icd10Codes.includes(c))) score += 5;

    if (procTokens.size) {
      const docTokens = tokenize(
        m.title,
        (m.procedures ?? []).join(' '),
        (m.aliases ?? []).join(' '),
      );
      score += 2 * overlaps(procTokens, docTokens);
    }
    if (diagTokens.size) {
      const condTokens = tokenize((m.relatedConditions ?? []).join(' '), m.title);
      score += overlaps(diagTokens, condTokens);
    }

    return { m, score };
  });

  // Criteria were provided but nothing matched → empty (caller decides on a
  // fallback). Otherwise return matches ranked by signal strength.
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.m);
}

/**
 * Reset cache (for testing)
 */
export function resetMetadataCache() {
  metadataCache = null;
}
