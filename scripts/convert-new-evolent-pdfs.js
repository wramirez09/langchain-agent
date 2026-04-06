const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const PDF_DIR = path.join(process.cwd(), 'app/api/data/evolent_pdfs');
const OUTPUT_DIR = path.join(process.cwd(), 'app/api/data/ev');

// Mapping of new PDF files to output filenames and metadata
const PDF_MAPPINGS = [
  {
    input: '2025 Evolent Advanced Imaging Guidelines_0.pdf',
    output: 'advanced-imaging-guidelines-2025.md',
    title: 'Advanced Imaging Guidelines',
    domain: 'imaging',
    specialty: ['radiology', 'diagnostic imaging', 'nuclear medicine'],
    priority: 'high',
    keywords: ['MRI', 'CT', 'PET', 'ultrasound', 'diagnostic imaging', 'medical imaging']
  },
  {
    input: '2025 Evolent Interventional Pain Management Guidelines.pdf',
    output: 'interventional-pain-management-guidelines-2025.md',
    title: 'Interventional Pain Management Guidelines',
    domain: 'pain-management',
    specialty: ['pain management', 'anesthesiology', 'interventional radiology'],
    priority: 'high',
    keywords: ['pain management', 'injections', 'nerve blocks', 'chronic pain', 'interventional procedures']
  },
  {
    input: 'Evolent clinical 2025 Cardiology Guidelines.pdf',
    output: 'cardiology-guidelines-2025.md',
    title: 'Cardiology Guidelines',
    domain: 'cardiology',
    specialty: ['cardiology', 'cardiovascular medicine'],
    priority: 'high',
    keywords: ['cardiac', 'cardiovascular', 'heart', 'cardiology procedures']
  }
];

async function extractPdfText(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error(`Error extracting PDF ${pdfPath}:`, error.message);
    return null;
  }
}

function generateYamlFrontMatter(metadata) {
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
    metadata.procedures.forEach(p => yaml.push(`  - "${p}"`));
  }
  
  if (metadata.aliases && metadata.aliases.length > 0) {
    yaml.push('aliases:');
    metadata.aliases.forEach(a => yaml.push(`  - "${a}"`));
  }
  
  if (metadata.relatedConditions && metadata.relatedConditions.length > 0) {
    yaml.push('relatedConditions:');
    metadata.relatedConditions.forEach(c => yaml.push(`  - "${c}"`));
  }
  
  if (metadata.cpt_codes && metadata.cpt_codes.length > 0) {
    yaml.push('cpt_codes:');
    metadata.cpt_codes.forEach(code => yaml.push(`  - "${code}"`));
  }
  
  if (metadata.icd10_codes && metadata.icd10_codes.length > 0) {
    yaml.push('icd10_codes:');
    metadata.icd10_codes.forEach(code => yaml.push(`  - "${code}"`));
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

function cleanPdfText(text) {
  let cleaned = text.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');
  cleaned = cleaned.replace(/Page \d+ of \d+/gi, '');
  cleaned = cleaned.replace(/^\d+\s*$/gm, '');
  return cleaned.trim();
}

async function convertPdf(mapping) {
  const inputPath = path.join(PDF_DIR, mapping.input);
  const outputPath = path.join(OUTPUT_DIR, mapping.output);
  
  console.log(`Processing: ${mapping.input}`);
  
  const text = await extractPdfText(inputPath);
  
  if (!text) {
    console.error(`Failed to extract text from ${mapping.input}`);
    return false;
  }
  
  const cleanedText = cleanPdfText(text);
  
  // Generate initial YAML (will be enhanced later)
  const frontMatter = generateYamlFrontMatter(mapping);
  
  // Combine - structured sections will be added by the enhancement script
  const markdown = frontMatter + '\n' + cleanedText;
  
  fs.writeFileSync(outputPath, markdown, 'utf8');
  
  console.log(`✓ Created: ${mapping.output}`);
  return true;
}

async function main() {
  console.log('=== Converting 3 New Evolent PDFs ===\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const mapping of PDF_MAPPINGS) {
    const success = await convertPdf(mapping);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }
  
  console.log(`\n=== Conversion Complete ===`);
  console.log(`✓ Success: ${successCount} files`);
  console.log(`✗ Failed: ${failCount} files`);
}

main().catch(console.error);
