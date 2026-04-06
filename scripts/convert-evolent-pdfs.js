const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

const PDF_DIR = path.join(process.cwd(), 'app/api/data/evolent');
const OUTPUT_DIR = path.join(process.cwd(), 'app/api/data/ev');

// Mapping of PDF files to output filenames and metadata
const PDF_MAPPINGS = [
  {
    input: '2024 Evolent Radiation Oncology Guidelines.pdf',
    output: 'radiation-oncology-guidelines-2024.md',
    title: 'Radiation Oncology Guidelines',
    domain: 'radiation-oncology',
    specialty: ['radiation oncology', 'oncology'],
    priority: 'high',
    keywords: ['radiation therapy', 'oncology', 'cancer treatment']
  },
  {
    input: '2025 Evolent Coding Standards .pdf',
    output: 'coding-standards-2025.md',
    title: 'Coding Standards',
    domain: 'coding',
    specialty: ['medical coding', 'billing'],
    priority: 'high',
    keywords: ['CPT codes', 'ICD-10', 'medical coding', 'billing']
  },
  {
    input: '2025 Evolent Expanded Cardiac Guidelines  (1).pdf',
    output: 'expanded-cardiac-guidelines-2025.md',
    title: 'Expanded Cardiac Guidelines',
    domain: 'cardiology',
    specialty: ['cardiology', 'cardiovascular'],
    priority: 'high',
    keywords: ['cardiac', 'heart', 'cardiovascular']
  },
  {
    input: '2025 Evolent Musculoskeletal Surgery Guidelines.pdf',
    output: 'musculoskeletal-surgery-guidelines-2025.md',
    title: 'Musculoskeletal Surgery Guidelines',
    domain: 'orthopedics',
    specialty: ['orthopedics', 'surgery'],
    priority: 'high',
    keywords: ['orthopedic surgery', 'musculoskeletal', 'joint surgery']
  },
  {
    input: '2025 Evolent Physical Medicine Guidelines - July.pdf',
    output: 'physical-medicine-guidelines-2025.md',
    title: 'Physical Medicine Guidelines',
    domain: 'physical-medicine',
    specialty: ['physical medicine', 'rehabilitation'],
    priority: 'medium',
    keywords: ['physical therapy', 'rehabilitation', 'PM&R']
  },
  {
    input: '2025 Evolent Sleep Study Guidelines_0.pdf',
    output: 'sleep-study-guidelines-2025.md',
    title: 'Sleep Study Guidelines',
    domain: 'sleep-medicine',
    specialty: ['sleep medicine', 'pulmonology'],
    priority: 'medium',
    keywords: ['sleep study', 'polysomnography', 'sleep apnea']
  },
  {
    input: 'Evolent Clinical Guideline 7000 for Radiation Therapy Services 2025.pdf',
    output: 'clinical-guideline-7000-radiation-therapy-2025.md',
    title: 'Clinical Guideline 7000: Radiation Therapy Services',
    domain: 'radiation-oncology',
    specialty: ['radiation oncology'],
    priority: 'high',
    keywords: ['radiation therapy', 'clinical guideline 7000']
  },
  {
    input: 'Evolent Clinical Guideline 7001 for Proton Beam Radiation Therapy and Neutron Beam Radiation Therapy Services 2025.pdf',
    output: 'clinical-guideline-7001-proton-beam-radiation-2025.md',
    title: 'Clinical Guideline 7001: Proton Beam and Neutron Beam Radiation Therapy',
    domain: 'radiation-oncology',
    specialty: ['radiation oncology'],
    priority: 'high',
    keywords: ['proton beam', 'neutron beam', 'radiation therapy', 'clinical guideline 7001']
  },
  {
    input: 'Evolent Outpatient Habilitative and Rehabilitative Speech Therapy 2024.pdf',
    output: 'outpatient-speech-therapy-2024.md',
    title: 'Outpatient Habilitative and Rehabilitative Speech Therapy',
    domain: 'speech-therapy',
    specialty: ['speech therapy', 'rehabilitation'],
    priority: 'medium',
    keywords: ['speech therapy', 'habilitative', 'rehabilitative']
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
  // Remove excessive whitespace
  let cleaned = text.replace(/\n{3,}/g, '\n\n');
  
  // Fix common PDF extraction issues
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');
  
  // Remove page numbers and headers/footers (common patterns)
  cleaned = cleaned.replace(/Page \d+ of \d+/gi, '');
  cleaned = cleaned.replace(/^\d+\s*$/gm, '');
  
  return cleaned.trim();
}

async function convertPdf(mapping) {
  const inputPath = path.join(PDF_DIR, mapping.input);
  const outputPath = path.join(OUTPUT_DIR, mapping.output);
  
  console.log(`Processing: ${mapping.input}`);
  
  // Extract PDF text
  const text = await extractPdfText(inputPath);
  
  if (!text) {
    console.error(`Failed to extract text from ${mapping.input}`);
    return false;
  }
  
  // Clean the text
  const cleanedText = cleanPdfText(text);
  
  // Generate YAML front matter
  const frontMatter = generateYamlFrontMatter(mapping);
  
  // Combine front matter and content
  const markdown = frontMatter + '\n' + cleanedText;
  
  // Write to file
  fs.writeFileSync(outputPath, markdown, 'utf8');
  
  console.log(`✓ Created: ${mapping.output}`);
  return true;
}

async function main() {
  console.log('Starting Evolent PDF conversion...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}\n`);
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // Process each PDF
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
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

main().catch(console.error);
