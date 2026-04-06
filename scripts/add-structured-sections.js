const fs = require('fs');
const path = require('path');

const EV_DIR = path.join(process.cwd(), 'app/api/data/ev');

/**
 * Parse existing front matter and body
 */
function parseFile(content) {
  const frontMatterMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!frontMatterMatch) {
    return { frontMatter: '', body: content };
  }
  return {
    frontMatter: frontMatterMatch[1],
    body: frontMatterMatch[2]
  };
}

/**
 * Extract medical necessity criteria from content
 */
function extractMedicalNecessityCriteria(content) {
  const lines = content.split('\n');
  const criteria = [];
  let inCriteriaSection = false;
  let currentSection = null;
  let currentIndications = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Detect section headers
    if (lowerLine.includes('indications for') || 
        lowerLine.includes('medical necessity') ||
        lowerLine.includes('criteria for')) {
      
      // Save previous section if exists
      if (currentSection && currentIndications.length > 0) {
        criteria.push({
          title: currentSection,
          indications: currentIndications
        });
      }
      
      currentSection = line.trim();
      currentIndications = [];
      inCriteriaSection = true;
    }
    // Detect exclusions/limitations (end of criteria)
    else if (lowerLine.includes('exclusion') || 
             lowerLine.includes('limitation') ||
             lowerLine.includes('not covered')) {
      inCriteriaSection = false;
      
      // Save current section
      if (currentSection && currentIndications.length > 0) {
        criteria.push({
          title: currentSection,
          indications: currentIndications
        });
        currentSection = null;
        currentIndications = [];
      }
    }
    // Collect indications
    else if (inCriteriaSection && line.trim().length > 0) {
      // Skip headers and page markers
      if (!line.match(/^Page \d+/) && 
          !line.match(/^Evolent/) &&
          !line.match(/^\d{4,}/)) {
        currentIndications.push(line.trim());
      }
    }
  }
  
  // Save last section
  if (currentSection && currentIndications.length > 0) {
    criteria.push({
      title: currentSection,
      indications: currentIndications
    });
  }
  
  return criteria;
}

/**
 * Extract limitations and exclusions
 */
function extractLimitationsAndExclusions(content) {
  const lines = content.split('\n');
  const limitations = [];
  const exclusions = [];
  let inLimitationsSection = false;
  let inExclusionsSection = false;
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('limitation')) {
      inLimitationsSection = true;
      inExclusionsSection = false;
    } else if (lowerLine.includes('exclusion') || lowerLine.includes('not covered')) {
      inExclusionsSection = true;
      inLimitationsSection = false;
    } else if (line.trim().length > 0 && 
               !line.match(/^Page \d+/) && 
               !line.match(/^Evolent/)) {
      if (inLimitationsSection) {
        limitations.push(line.trim());
      } else if (inExclusionsSection) {
        exclusions.push(line.trim());
      }
    }
  }
  
  return { limitations, exclusions };
}

/**
 * Extract documentation requirements
 */
function extractDocumentationRequirements(content) {
  const lines = content.split('\n');
  const requirements = [];
  let inDocSection = false;
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('documentation') || 
        lowerLine.includes('required') ||
        lowerLine.includes('must include') ||
        lowerLine.includes('submit')) {
      inDocSection = true;
    } else if (lowerLine.includes('exclusion') || 
               lowerLine.includes('limitation') ||
               lowerLine.includes('coding')) {
      inDocSection = false;
    } else if (inDocSection && line.trim().length > 0 &&
               !line.match(/^Page \d+/) && 
               !line.match(/^Evolent/)) {
      requirements.push(line.trim());
    }
  }
  
  return requirements;
}

/**
 * Determine prior authorization requirement
 */
function determinePriorAuthRequirement(content) {
  const lowerContent = content.toLowerCase();
  
  if (lowerContent.includes('prior authorization required') ||
      lowerContent.includes('pre-authorization required')) {
    return 'YES - Prior authorization is required for services covered by this guideline.';
  } else if (lowerContent.includes('prior authorization') ||
             lowerContent.includes('pre-authorization')) {
    return 'CONDITIONAL - Prior authorization may be required based on specific circumstances. Refer to payer-specific requirements.';
  }
  
  return 'Refer to payer-specific requirements for prior authorization determination.';
}

/**
 * Generate structured content sections
 */
function generateStructuredContent(body, metadata) {
  let structured = '';
  
  // Medical Necessity Framework
  structured += '## Medical Necessity Framework\n\n';
  structured += 'This guideline outlines the medical necessity criteria for authorization of services. ';
  structured += 'All requests must meet the clinical criteria specified below and include appropriate documentation.\n\n';
  structured += '---\n\n';
  
  // Medical Necessity Criteria
  const criteria = extractMedicalNecessityCriteria(body);
  
  if (criteria.length > 0) {
    structured += '## Medical Necessity Criteria\n\n';
    
    criteria.forEach(section => {
      structured += `### ${section.title}\n\n`;
      structured += '**Clinical Indications:**\n';
      section.indications.slice(0, 10).forEach(indication => {
        if (indication.startsWith('-') || indication.startsWith('•')) {
          structured += `${indication}\n`;
        } else {
          structured += `- ${indication}\n`;
        }
      });
      structured += '\n';
    });
    
    structured += '---\n\n';
  }
  
  // Required Documentation
  const docRequirements = extractDocumentationRequirements(body);
  
  structured += '## Required Documentation\n\n';
  structured += '**For All Requests:**\n';
  structured += '- Recent pertinent office visit notes\n';
  structured += '- Relevant clinical history and physical examination findings\n';
  structured += '- Results of any prior diagnostic testing\n';
  
  if (docRequirements.length > 0) {
    structured += '\n**Procedure-Specific Documentation:**\n';
    docRequirements.slice(0, 8).forEach(req => {
      if (req.startsWith('-') || req.startsWith('•')) {
        structured += `${req}\n`;
      } else {
        structured += `- ${req}\n`;
      }
    });
  }
  
  structured += '\n---\n\n';
  
  // Limitations and Exclusions
  const { limitations, exclusions } = extractLimitationsAndExclusions(body);
  
  structured += '## Limitations and Exclusions\n\n';
  
  if (limitations.length > 0) {
    structured += '**General Limitations:**\n';
    limitations.slice(0, 5).forEach(lim => {
      if (lim.startsWith('-') || lim.startsWith('•')) {
        structured += `${lim}\n`;
      } else {
        structured += `- ${lim}\n`;
      }
    });
    structured += '\n';
  }
  
  if (exclusions.length > 0) {
    structured += '**Exclusions:**\n';
    exclusions.slice(0, 5).forEach(exc => {
      if (exc.startsWith('-') || exc.startsWith('•')) {
        structured += `${exc}\n`;
      } else {
        structured += `- ${exc}\n`;
      }
    });
    structured += '\n';
  }
  
  if (limitations.length === 0 && exclusions.length === 0) {
    structured += 'Refer to the full guideline document for specific limitations and exclusions.\n\n';
  }
  
  structured += '---\n\n';
  
  // Prior Authorization Requirements
  const priorAuthReq = determinePriorAuthRequirement(body);
  
  structured += '## Prior Authorization Requirements\n\n';
  structured += `${priorAuthReq}\n\n`;
  structured += '---\n\n';
  
  // Relevant Coding Information
  structured += '## Relevant Coding Information\n\n';
  
  if (metadata.cpt_codes && metadata.cpt_codes.length > 0) {
    structured += '**CPT/HCPCS Codes:**\n';
    metadata.cpt_codes.slice(0, 20).forEach(code => {
      structured += `- ${code}\n`;
    });
    if (metadata.cpt_codes.length > 20) {
      structured += `- *(${metadata.cpt_codes.length - 20} additional codes in guideline)*\n`;
    }
    structured += '\n';
  }
  
  if (metadata.icd10_codes && metadata.icd10_codes.length > 0) {
    structured += '**ICD-10 Codes:**\n';
    metadata.icd10_codes.slice(0, 20).forEach(code => {
      structured += `- ${code}\n`;
    });
    if (metadata.icd10_codes.length > 20) {
      structured += `- *(${metadata.icd10_codes.length - 20} additional codes in guideline)*\n`;
    }
  }
  
  return structured;
}

/**
 * Extract metadata from YAML front matter
 */
function extractMetadata(frontMatter) {
  const metadata = {};
  
  // Extract CPT codes
  const cptMatch = frontMatter.match(/cpt_codes:\s*\n((?:\s+-\s+"[^"]+"\n?)+)/);
  if (cptMatch) {
    metadata.cpt_codes = cptMatch[1].match(/"([^"]+)"/g).map(c => c.replace(/"/g, ''));
  }
  
  // Extract ICD-10 codes
  const icd10Match = frontMatter.match(/icd10_codes:\s*\n((?:\s+-\s+"[^"]+"\n?)+)/);
  if (icd10Match) {
    metadata.icd10_codes = icd10Match[1].match(/"([^"]+)"/g).map(c => c.replace(/"/g, ''));
  }
  
  return metadata;
}

/**
 * Process a single file
 */
function processFile(filename) {
  const filePath = path.join(EV_DIR, filename);
  
  console.log(`\nProcessing: ${filename}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { frontMatter, body } = parseFile(content);
    
    if (!frontMatter) {
      console.log('  ⚠ No front matter found, skipping');
      return false;
    }
    
    // Extract metadata from front matter
    const metadata = extractMetadata(frontMatter);
    
    // Generate structured content
    const structuredContent = generateStructuredContent(body, metadata);
    
    // Combine front matter and structured content
    const newContent = frontMatter + '\n' + structuredContent;
    
    // Write back
    fs.writeFileSync(filePath, newContent, 'utf8');
    
    console.log('  ✓ Added structured sections');
    
    return true;
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Adding Structured Sections to Evolent Guidelines ===\n');
  
  const files = fs.readdirSync(EV_DIR).filter(f => f.endsWith('.md'));
  
  console.log(`Found ${files.length} markdown files to process\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const file of files) {
    const success = processFile(file);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log('\n=== Structured Sections Added ===');
  console.log(`✓ Success: ${successCount} files`);
  console.log(`✗ Failed: ${failCount} files`);
}

main().catch(console.error);
