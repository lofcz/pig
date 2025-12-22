// Run with: npx tsx tools/inspect_odt.ts
import JSZip from 'jszip';
import { readFileSync, writeFileSync } from 'fs';

const templatePath = process.argv[2] || 'reference/pig_template_scio.odt';

async function inspectOdt() {
  console.log(`\n📄 Inspecting: ${templatePath}\n`);
  
  const data = readFileSync(templatePath);
  const zip = await JSZip.loadAsync(data);
  
  // List all files in the ODT
  console.log('=== Files in ODT ===');
  for (const filename of Object.keys(zip.files)) {
    console.log(`  ${filename}`);
  }
  
  // Extract and format content.xml
  const contentFile = zip.file('content.xml');
  if (!contentFile) {
    console.error('No content.xml found!');
    return;
  }
  
  const content = await contentFile.async('string');
  
  // Save raw content for inspection
  writeFileSync('tools/content_raw.xml', content);
  console.log('\n✅ Saved raw content.xml to tools/content_raw.xml');
  
  // Pretty print with basic formatting
  const formatted = content
    .replace(/></g, '>\n<')
    .replace(/(<text:[ph][^>]*>)/g, '\n$1');
  writeFileSync('tools/content_formatted.xml', formatted);
  console.log('✅ Saved formatted content.xml to tools/content_formatted.xml');
  
  // Find all placeholders
  console.log('\n=== Placeholder Analysis ===\n');
  
  // Look for {{ patterns
  const placeholderPattern = /\{\{[^}]*\}\}/g;
  const foundPlaceholders = content.match(placeholderPattern) || [];
  
  console.log('Complete placeholders found in single text runs:');
  for (const p of [...new Set(foundPlaceholders)]) {
    console.log(`  ✅ ${p}`);
  }
  
  // Look for broken placeholders ({{ without matching }})
  const openBraces = content.match(/\{\{[^}]*(?=<)/g) || [];
  const closeBraces = content.match(/(?<=>)[^{]*\}\}/g) || [];
  
  if (openBraces.length > 0 || closeBraces.length > 0) {
    console.log('\n⚠️  Potentially SPLIT placeholders (broken by XML tags):');
    for (const o of openBraces) {
      if (!o.includes('}}')) {
        console.log(`  🔴 Opens: "${o}" (continues after XML tag)`);
      }
    }
    for (const c of closeBraces) {
      if (!c.includes('{{')) {
        console.log(`  🔴 Closes: "${c}" (started before XML tag)`);
      }
    }
  }
  
  // Extract text:p and text:h elements to see structure
  console.log('\n=== Text Paragraphs/Headings with Placeholders ===\n');
  
  const textElementPattern = /<text:[ph][^>]*>.*?<\/text:[ph]>/gs;
  const textElements = content.match(textElementPattern) || [];
  
  for (const elem of textElements) {
    if (elem.includes('{{') || elem.includes('}}') || elem.includes('P_')) {
      // Show a simplified view
      const textOnly = elem.replace(/<[^>]+>/g, '|');
      console.log('---');
      console.log('XML:', elem.substring(0, 200) + (elem.length > 200 ? '...' : ''));
      console.log('Text parts:', textOnly);
      console.log('');
    }
  }
  
  // Check styles.xml too
  const stylesFile = zip.file('styles.xml');
  if (stylesFile) {
    const styles = await stylesFile.async('string');
    writeFileSync('tools/styles_raw.xml', styles);
    console.log('✅ Saved styles.xml to tools/styles_raw.xml');
    
    const stylePlaceholders = styles.match(placeholderPattern) || [];
    if (stylePlaceholders.length > 0) {
      console.log('\nPlaceholders in styles.xml:');
      for (const p of [...new Set(stylePlaceholders)]) {
        console.log(`  ${p}`);
      }
    }
  }
}

inspectOdt().catch(console.error);

