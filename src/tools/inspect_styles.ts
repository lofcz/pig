// Run with: npx tsx tools/inspect_styles.ts
import JSZip from 'jszip';
import { readFileSync } from 'fs';

async function inspect() {
  const data = readFileSync('reference/pig_template_scio.odt');
  const zip = await JSZip.loadAsync(data);
  const content = await zip.file('content.xml')!.async('string');
  const styles = await zip.file('styles.xml')?.async('string') || '';
  
  const allContent = content + styles;
  
  // Find automatic style definitions
  console.log('=== Automatic Styles ===\n');
  
  const autoStylePattern = /<style:style[^>]*style:name="([^"]+)"[^>]*>([\s\S]*?)<\/style:style>/g;
  let match;
  
  const styleInfo: Record<string, string[]> = {};
  
  while ((match = autoStylePattern.exec(allContent)) !== null) {
    const name = match[1];
    const body = match[2];
    
    const props: string[] = [];
    
    // Extract text properties
    const textPropsMatch = body.match(/<style:text-properties([^>]*)\/>/);
    if (textPropsMatch) {
      const attrs = textPropsMatch[1];
      
      const fontSize = attrs.match(/fo:font-size="([^"]+)"/)?.[1];
      const fontWeight = attrs.match(/fo:font-weight="([^"]+)"/)?.[1];
      const fontName = attrs.match(/style:font-name="([^"]+)"/)?.[1];
      const fontStyle = attrs.match(/fo:font-style="([^"]+)"/)?.[1];
      
      if (fontSize) props.push(`size: ${fontSize}`);
      if (fontWeight) props.push(`weight: ${fontWeight}`);
      if (fontName) props.push(`font: ${fontName}`);
      if (fontStyle) props.push(`style: ${fontStyle}`);
    }
    
    // Extract paragraph properties
    const paraPropsMatch = body.match(/<style:paragraph-properties([^>]*)\/>/);
    if (paraPropsMatch) {
      const attrs = paraPropsMatch[1];
      const textAlign = attrs.match(/fo:text-align="([^"]+)"/)?.[1];
      if (textAlign) props.push(`align: ${textAlign}`);
    }
    
    if (props.length > 0) {
      styleInfo[name] = props;
    }
  }
  
  // Sort and display
  const sorted = Object.entries(styleInfo).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, props] of sorted) {
    console.log(`${name}: ${props.join(', ')}`);
  }
  
  // Show which styles are used where
  console.log('\n=== Placeholder locations and their styles ===\n');
  
  const placeholderPattern = /<text:[ph][^>]*text:style-name="([^"]+)"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/text:[ph]>/g;
  
  while ((match = placeholderPattern.exec(content)) !== null) {
    const paraStyle = match[1];
    const innerContent = match[2];
    
    if (innerContent.includes('{{') || innerContent.includes('P_')) {
      // Find span styles within
      const spanStyles: string[] = [];
      const spanPattern = /<text:span[^>]*text:style-name="([^"]+)"[^>]*>([^<]*)/g;
      let spanMatch;
      while ((spanMatch = spanPattern.exec(innerContent)) !== null) {
        spanStyles.push(`${spanMatch[1]}:"${spanMatch[2]}"`);
      }
      
      const textOnly = innerContent.replace(/<[^>]+>/g, '');
      console.log(`Para ${paraStyle}: "${textOnly}"`);
      if (spanStyles.length > 0) {
        console.log(`  Spans: ${spanStyles.join(', ')}`);
      }
      console.log('');
    }
  }
}

inspect().catch(console.error);

