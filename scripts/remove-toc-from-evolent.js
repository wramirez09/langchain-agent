const fs = require('fs');
const path = require('path');

const EV_DIR = path.join(process.cwd(), 'app/api/data/ev');

/**
 * Remove table of contents sections from content
 * TOC sections are characterized by:
 * - Lines with dots (.....) between text and page numbers
 * - "TABLE OF CONTENTS" header
 * - Section headers followed by dotted lines with page numbers
 */
function removeTableOfContents(content) {
  // Split into front matter and body
  const frontMatterMatch = content.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  if (!frontMatterMatch) {
    console.log('  ⚠ No front matter found, processing entire content');
    return cleanTOC(content);
  }
  
  const frontMatter = frontMatterMatch[1];
  const body = frontMatterMatch[2];
  
  const cleanedBody = cleanTOC(body);
  
  return frontMatter + cleanedBody;
}

/**
 * Clean TOC patterns from body content
 */
function cleanTOC(text) {
  let cleaned = text;
  
  // Pattern 1: Remove "TABLE OF CONTENTS" header and surrounding lines
  cleaned = cleaned.replace(/TABLE OF CONTENTS\s*\n/gi, '');
  
  // Pattern 2: Remove lines with dots leading to page numbers
  // Examples:
  // "STATEMENT .................................................................................................................................... 8"
  // "Indications for 3D-CRT ............................................................................................................ 11"
  cleaned = cleaned.replace(/^.+?\.{3,}\s*\d+\s*$/gm, '');
  
  // Pattern 3: Remove lines that are just dots and numbers
  cleaned = cleaned.replace(/^[\s.]+\d+\s*$/gm, '');
  
  // Pattern 4: Remove standalone page numbers on their own lines
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, '');
  
  // Pattern 5: Remove lines with excessive dots (more than 10 consecutive dots)
  cleaned = cleaned.replace(/^.*\.{10,}.*$/gm, '');
  
  // Clean up excessive blank lines (more than 2 consecutive)
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Process a single file
 */
function processFile(filename) {
  const filePath = path.join(EV_DIR, filename);
  
  console.log(`\nProcessing: ${filename}`);
  
  try {
    // Read file
    const content = fs.readFileSync(filePath, 'utf8');
    const originalLength = content.length;
    
    // Remove TOC
    const cleaned = removeTableOfContents(content);
    const newLength = cleaned.length;
    
    const removedBytes = originalLength - newLength;
    const removedPercent = ((removedBytes / originalLength) * 100).toFixed(1);
    
    // Write back
    fs.writeFileSync(filePath, cleaned, 'utf8');
    
    console.log(`  ✓ Removed ${removedBytes} bytes (${removedPercent}%) of TOC content`);
    
    return true;
  } catch (error) {
    console.error(`  ✗ Error processing ${filename}:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Removing Table of Contents from Evolent Guidelines ===\n');
  
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
  
  console.log('\n=== TOC Removal Complete ===');
  console.log(`✓ Success: ${successCount} files`);
  console.log(`✗ Failed: ${failCount} files`);
}

main().catch(console.error);
