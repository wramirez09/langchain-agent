const fs = require('fs');
const path = require('path');

const EV_DIR = path.join(process.cwd(), 'app/api/data/ev');

// Enhanced metadata extraction patterns
const PATTERNS = {
  // CPT codes: 5 digits, sometimes with modifiers
  cpt: /\b(\d{5})(?:-[A-Z0-9]{2})?\b/g,
  
  // ICD-10 codes: Letter followed by 2 digits, optional dot and more digits
  icd10: /\b([A-Z]\d{2}(?:\.\d{1,4})?)\b/g,
  
  // HCPCS codes: Letter followed by 4 digits
  hcpcs: /\b([A-Z]\d{4})\b/g,
  
  // Common procedure patterns
  procedures: [
    /\b(IMRT|3D-CRT|SBRT|IORT|SIRT|proton beam|neutron beam|brachytherapy)\b/gi,
    /\b(radiation therapy|radiotherapy|radiosurgery)\b/gi,
    /\b(polysomnography|sleep study|CPAP|home sleep test)\b/gi,
    /\b(physical therapy|occupational therapy|speech therapy)\b/gi,
    /\b(cardiac|musculoskeletal|orthopedic) (?:surgery|procedure|intervention)\b/gi,
    /\b(MRI|CT|PET|ultrasound|x-ray|imaging)\b/gi,
  ],
  
  // Medical conditions
  conditions: [
    /\b(cancer|carcinoma|tumor|neoplasm|malignancy)\b/gi,
    /\b(sleep apnea|insomnia|narcolepsy)\b/gi,
    /\b(arthritis|osteoarthritis|joint pain|back pain)\b/gi,
    /\b(cardiac|heart|cardiovascular) (?:disease|condition|disorder)\b/gi,
    /\b(speech delay|language disorder|dysphagia|aphasia)\b/gi,
  ]
};

/**
 * Extract unique codes from content
 */
function extractCodes(content, pattern) {
  const matches = content.match(pattern) || [];
  const unique = [...new Set(matches)];
  
  // Filter out common false positives
  return unique.filter(code => {
    // For CPT codes, exclude years and common numbers
    if (/^\d{5}$/.test(code)) {
      const num = parseInt(code);
      return num >= 10000 && num <= 99999 && num !== 20000 && num !== 30000;
    }
    return true;
  }).sort();
}

/**
 * Extract procedures from content
 */
function extractProcedures(content) {
  const procedures = new Set();
  
  PATTERNS.procedures.forEach(pattern => {
    const matches = content.match(pattern) || [];
    matches.forEach(match => {
      procedures.add(match.toLowerCase().trim());
    });
  });
  
  return [...procedures].sort();
}

/**
 * Extract medical conditions from content
 */
function extractConditions(content) {
  const conditions = new Set();
  
  PATTERNS.conditions.forEach(pattern => {
    const matches = content.match(pattern) || [];
    matches.forEach(match => {
      conditions.add(match.toLowerCase().trim());
    });
  });
  
  return [...conditions].sort();
}

/**
 * Extract aliases based on domain and content
 */
function extractAliases(domain, title, content) {
  const aliases = new Set();
  
  // Domain-specific aliases
  const domainAliases = {
    'radiation-oncology': ['radiation therapy', 'radiotherapy', 'RT', 'XRT'],
    'cardiology': ['cardiac', 'heart', 'cardiovascular'],
    'orthopedics': ['ortho', 'musculoskeletal', 'MSK'],
    'sleep-medicine': ['sleep study', 'polysomnography', 'PSG'],
    'physical-medicine': ['PM&R', 'physiatry', 'rehab'],
    'speech-therapy': ['SLP', 'speech-language pathology'],
    'coding': ['medical coding', 'billing codes', 'CPT/ICD-10']
  };
  
  if (domainAliases[domain]) {
    domainAliases[domain].forEach(alias => aliases.add(alias));
  }
  
  // Extract acronyms from title
  const acronymMatch = title.match(/\b([A-Z]{2,})\b/g);
  if (acronymMatch) {
    acronymMatch.forEach(acronym => aliases.add(acronym));
  }
  
  return [...aliases];
}

/**
 * Restructure content into sections
 */
function restructureContent(content, metadata) {
  let structured = '';
  
  // Add Medical Necessity Framework section if content has criteria
  if (content.toLowerCase().includes('medical necessity') || 
      content.toLowerCase().includes('indications')) {
    structured += '## Medical Necessity Framework\n\n';
    structured += 'This guideline outlines the medical necessity criteria for authorization of services.\n\n';
    structured += '---\n\n';
  }
  
  // Keep original content but clean it up
  let cleanedContent = content
    .replace(/\n{3,}/g, '\n\n')  // Remove excessive line breaks
    .replace(/^\s+$/gm, '')      // Remove whitespace-only lines
    .trim();
  
  structured += cleanedContent;
  
  // Add coding section if we have codes
  const hasCptCodes = metadata.cpt_codes && metadata.cpt_codes.length > 0;
  const hasIcd10Codes = metadata.icd10_codes && metadata.icd10_codes.length > 0;
  
  if (hasCptCodes || hasIcd10Codes) {
    structured += '\n\n---\n\n';
    structured += '## Relevant Coding Information\n\n';
    
    if (hasCptCodes) {
      structured += '**CPT/HCPCS Codes:**\n';
      metadata.cpt_codes.slice(0, 20).forEach(code => {
        structured += `- ${code}\n`;
      });
      if (metadata.cpt_codes.length > 20) {
        structured += `- *(${metadata.cpt_codes.length - 20} additional codes in guideline)*\n`;
      }
      structured += '\n';
    }
    
    if (hasIcd10Codes) {
      structured += '**ICD-10 Codes:**\n';
      metadata.icd10_codes.slice(0, 20).forEach(code => {
        structured += `- ${code}\n`;
      });
      if (metadata.icd10_codes.length > 20) {
        structured += `- *(${metadata.icd10_codes.length - 20} additional codes in guideline)*\n`;
      }
    }
  }
  
  return structured;
}

/**
 * Generate enhanced YAML front matter
 */
function generateEnhancedYaml(metadata) {
  const yaml = [];
  yaml.push('---');
  yaml.push(`title: "${metadata.title}"`);
  yaml.push(`domain: "${metadata.domain}"`);
  
  if (metadata.specialty && metadata.specialty.length > 0) {
    yaml.push('specialty:');
    metadata.specialty.forEach(s => yaml.push(`  - "${s}"`));
  }
  
  if (metadata.procedures && metadata.procedures.length > 0) {
    yaml.push('procedures:');
    metadata.procedures.slice(0, 15).forEach(p => yaml.push(`  - "${p}"`));
  }
  
  if (metadata.aliases && metadata.aliases.length > 0) {
    yaml.push('aliases:');
    metadata.aliases.forEach(a => yaml.push(`  - "${a}"`));
  }
  
  if (metadata.relatedConditions && metadata.relatedConditions.length > 0) {
    yaml.push('relatedConditions:');
    metadata.relatedConditions.slice(0, 15).forEach(c => yaml.push(`  - "${c}"`));
  }
  
  if (metadata.cpt_codes && metadata.cpt_codes.length > 0) {
    yaml.push('cpt_codes:');
    metadata.cpt_codes.slice(0, 30).forEach(code => yaml.push(`  - "${code}"`));
  }
  
  if (metadata.icd10_codes && metadata.icd10_codes.length > 0) {
    yaml.push('icd10_codes:');
    metadata.icd10_codes.slice(0, 30).forEach(code => yaml.push(`  - "${code}"`));
  }
  
  yaml.push(`priority: "${metadata.priority}"`);
  
  if (metadata.keywords && metadata.keywords.length > 0) {
    yaml.push('keywords:');
    metadata.keywords.forEach(k => yaml.push(`  - "${k}"`));
  }
  
  yaml.push('---');
  yaml.push('');
  
  return yaml.join('\n');
}

/**
 * Parse existing front matter
 */
function parseExistingFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  
  const yamlContent = match[1];
  const metadata = {};
  
  // Extract title
  const titleMatch = yamlContent.match(/title:\s*"([^"]+)"/);
  if (titleMatch) metadata.title = titleMatch[1];
  
  // Extract domain
  const domainMatch = yamlContent.match(/domain:\s*"([^"]+)"/);
  if (domainMatch) metadata.domain = domainMatch[1];
  
  // Extract specialty
  const specialtyMatch = yamlContent.match(/specialty:\s*\n((?:\s+-\s+"[^"]+"\n?)+)/);
  if (specialtyMatch) {
    metadata.specialty = specialtyMatch[1]
      .match(/"([^"]+)"/g)
      .map(s => s.replace(/"/g, ''));
  }
  
  // Extract priority
  const priorityMatch = yamlContent.match(/priority:\s*"([^"]+)"/);
  if (priorityMatch) metadata.priority = priorityMatch[1];
  
  // Extract keywords
  const keywordsMatch = yamlContent.match(/keywords:\s*\n((?:\s+-\s+"[^"]+"\n?)+)/);
  if (keywordsMatch) {
    metadata.keywords = keywordsMatch[1]
      .match(/"([^"]+)"/g)
      .map(k => k.replace(/"/g, ''));
  }
  
  return metadata;
}

/**
 * Enhance a single guideline file
 */
async function enhanceGuideline(filename) {
  const filePath = path.join(EV_DIR, filename);
  
  console.log(`\nProcessing: ${filename}`);
  
  // Read file
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Parse existing front matter
  const existingMetadata = parseExistingFrontMatter(content);
  if (!existingMetadata) {
    console.error(`  ✗ No front matter found in ${filename}`);
    return false;
  }
  
  // Extract body content (after front matter)
  const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  const bodyContent = bodyMatch ? bodyMatch[1] : content;
  
  // Extract metadata from content
  console.log('  - Extracting CPT codes...');
  const cptCodes = extractCodes(bodyContent, PATTERNS.cpt);
  
  console.log('  - Extracting ICD-10 codes...');
  const icd10Codes = extractCodes(bodyContent, PATTERNS.icd10);
  
  console.log('  - Extracting procedures...');
  const procedures = extractProcedures(bodyContent);
  
  console.log('  - Extracting conditions...');
  const conditions = extractConditions(bodyContent);
  
  console.log('  - Generating aliases...');
  const aliases = extractAliases(
    existingMetadata.domain,
    existingMetadata.title,
    bodyContent
  );
  
  // Build enhanced metadata
  const enhancedMetadata = {
    ...existingMetadata,
    procedures: procedures.length > 0 ? procedures : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    relatedConditions: conditions.length > 0 ? conditions : undefined,
    cpt_codes: cptCodes.length > 0 ? cptCodes : undefined,
    icd10_codes: icd10Codes.length > 0 ? icd10Codes : undefined,
  };
  
  console.log(`  ✓ Found: ${cptCodes.length} CPT codes, ${icd10Codes.length} ICD-10 codes`);
  console.log(`  ✓ Found: ${procedures.length} procedures, ${conditions.length} conditions`);
  
  // Generate new YAML front matter
  const newYaml = generateEnhancedYaml(enhancedMetadata);
  
  // Restructure content
  const restructuredContent = restructureContent(bodyContent, enhancedMetadata);
  
  // Combine and write
  const enhancedFile = newYaml + '\n' + restructuredContent;
  fs.writeFileSync(filePath, enhancedFile, 'utf8');
  
  console.log(`  ✓ Enhanced: ${filename}`);
  return true;
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Enhancing Evolent Guidelines ===\n');
  
  const files = fs.readdirSync(EV_DIR).filter(f => f.endsWith('.md'));
  
  console.log(`Found ${files.length} markdown files to process\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const file of files) {
    const success = await enhanceGuideline(file);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('\n=== Enhancement Complete ===');
  console.log(`✓ Success: ${successCount} files`);
  console.log(`✗ Failed: ${failCount} files`);
}

main().catch(console.error);
