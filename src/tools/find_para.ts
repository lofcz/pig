// Run with: npx tsx tools/find_para.ts
import JSZip from 'jszip';
import { readFileSync } from 'fs';

async function inspect() {
  const data = readFileSync('reference/pig_template_scio.odt');
  const zip = await JSZip.loadAsync(data);
  const content = await zip.file('content.xml')!.async('string');
  
  const placeholders = ['P_ISSUED', 'P_DUZP', 'P_DUE', 'P_DESC'];
  
  for (const p of placeholders) {
    // Find the paragraph containing this placeholder
    // Look for <text:p ...>...</text:p> or <text:h ...>...</text:h> containing the placeholder
    
    const idx = content.indexOf(p);
    if (idx === -1) continue;
    
    // Search backwards for <text:p or <text:h
    let start = idx;
    while (start > 0 && !content.substring(start, start + 8).match(/<text:[ph]/)) {
      start--;
    }
    
    // Search forwards for </text:p> or </text:h>
    let end = idx;
    while (end < content.length && !content.substring(end, end + 10).match(/<\/text:[ph]>/)) {
      end++;
    }
    end += 10;
    
    const para = content.substring(start, end);
    const formatted = para
      .replace(/><text:span/g, '>\n    <text:span')
      .replace(/<\/text:span>/g, '</text:span>')
      .replace(/<\/text:[ph]>/g, '\n</$&');
    
    console.log(`\n=== ${p} ===`);
    console.log(formatted);
  }
}

inspect().catch(console.error);
