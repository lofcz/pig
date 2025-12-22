// Run with: npx tsx tools/compare_odt.ts [generated.odt]
import JSZip from 'jszip';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

async function inspect(path: string) {
  if (!existsSync(path)) {
    console.log(`File not found: ${path}`);
    return;
  }
  
  console.log(`\n=== Inspecting: ${path} ===\n`);
  
  const data = readFileSync(path);
  const zip = await JSZip.loadAsync(data);
  const content = await zip.file('content.xml')!.async('string');
  
  // Find paragraphs with dates or specific content
  const patterns = [
    /30\.\s*9\.\s*2025/,  // Date pattern
    /Datum vystavení/,
    /Datum zdanitelného/,
    /Datum splatnosti/,
    /ScioŠkola/,
    /Konzultační/
  ];
  
  for (const pattern of patterns) {
    const idx = content.search(pattern);
    if (idx === -1) continue;
    
    // Find enclosing paragraph
    let start = idx;
    while (start > 0 && !content.substring(start, start + 8).match(/<text:[ph]/)) {
      start--;
    }
    
    let end = idx;
    while (end < content.length && !content.substring(end, end + 10).match(/<\/text:[ph]>/)) {
      end++;
    }
    end += 10;
    
    const para = content.substring(start, end);
    const formatted = para.replace(/></g, '>\n  <');
    
    console.log(`--- ${pattern} ---`);
    console.log(formatted.substring(0, 400));
    if (formatted.length > 400) console.log('...');
    console.log('');
  }
}

// Find preview file
const previewDir = 'D:\\dulezite\\faktury\\.preview';
if (existsSync(previewDir)) {
  const files = readdirSync(previewDir).filter(f => f.endsWith('.odt'));
  if (files.length > 0) {
    const latest = files.sort().reverse()[0];
    inspect(join(previewDir, latest));
  } else {
    console.log('No .odt files in preview directory');
  }
} else {
  console.log('Preview directory not found. Generate a preview first.');
}

// Also compare with template
inspect('reference/pig_template_scio.odt');

