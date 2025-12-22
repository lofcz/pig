import JSZip from 'jszip';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { platform } from '@tauri-apps/plugin-os';

interface TextNode {
  node: Text;
  parent: Element;
  text: string;
}

/**
 * Check if element is a text:span (handles namespaces)
 */
function isTextSpan(el: Element): boolean {
  const localName = (el.localName || el.tagName || '').toLowerCase();
  return localName === 'span' || localName === 'text:span';
}

/**
 * Check if element is text:p or text:h (handles namespaces)
 */
function isTextContainer(el: Element): boolean {
  const localName = (el.localName || el.tagName || '').toLowerCase();
  return localName === 'p' || localName === 'h' || localName === 'text:p' || localName === 'text:h';
}

/**
 * Collect all text nodes from an element in document order.
 */
function collectTextNodes(element: Element): TextNode[] {
  const result: TextNode[] = [];
  
  function walk(node: Node, parent: Element) {
    if (node.nodeType === Node.TEXT_NODE) {
      result.push({
        node: node as Text,
        parent: parent,
        text: node.textContent || ''
      });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      for (const child of el.childNodes) {
        walk(child, el);
      }
    }
  }
  
  for (const child of element.childNodes) {
    walk(child, element);
  }
  
  return result;
}

/**
 * Apply replacements to text.
 */
function applyReplacements(text: string, replacements: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  return result;
}

/**
 * Check if text contains any placeholder.
 */
function containsPlaceholder(text: string, replacements: Record<string, string>): boolean {
  for (const key of Object.keys(replacements)) {
    if (text.includes(key)) return true;
  }
  return false;
}

/**
 * Create content with line breaks for ODT.
 */
function createContentWithLineBreaks(text: string, doc: Document): Node[] {
  const nodes: Node[] = [];
  const parts = text.split('\n');
  
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const lineBreak = doc.createElementNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0', 'text:line-break');
      nodes.push(lineBreak);
    }
    if (parts[i]) {
      nodes.push(doc.createTextNode(parts[i]));
    }
  }
  
  return nodes;
}

/**
 * Process a text container (text:p or text:h).
 * Preserves styling by keeping span structure when possible.
 */
function processTextContainer(element: Element, replacements: Record<string, string>, doc: Document): void {
  const textNodes = collectTextNodes(element);
  if (textNodes.length === 0) return;
  
  // Get full text
  const fullText = textNodes.map(t => t.text).join('');
  
  if (!containsPlaceholder(fullText, replacements)) {
    return;
  }
  
  // Apply replacements
  const newText = applyReplacements(fullText, replacements);
  
  if (newText === fullText) return;
  
  // Find the span that should hold the result (the one with most placeholder content)
  let targetSpan: Element | null = null;
  let maxContentLength = 0;
  
  for (const tn of textNodes) {
    // Check if this node contains significant placeholder content (letters/underscore)
    const hasPlaceholderContent = /[A-Z_]/.test(tn.text);
    if (hasPlaceholderContent && tn.text.length > maxContentLength) {
      // Check if parent is a span
      if (isTextSpan(tn.parent)) {
        maxContentLength = tn.text.length;
        targetSpan = tn.parent;
      }
    }
  }
  
  // Clear all content from the paragraph
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
  
  // Create new content nodes
  const contentNodes = createContentWithLineBreaks(newText, doc);
  
  if (targetSpan) {
    // Clone the span to preserve its style, then add content
    const newSpan = targetSpan.cloneNode(false) as Element;
    for (const node of contentNodes) {
      newSpan.appendChild(node);
    }
    element.appendChild(newSpan);
  } else {
    // No suitable span found - put content directly in paragraph
    // (This loses span styling, but preserves paragraph styling)
    for (const node of contentNodes) {
      element.appendChild(node);
    }
  }
}

/**
 * Replace placeholders in XML content using DOM parsing.
 */
function replaceInXml(xmlContent: string, replacements: Record<string, string>): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');
  
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('XML parsing error, falling back to string replace');
    return applyReplacements(xmlContent, replacements);
  }
  
  // Process all paragraph and heading elements
  const allElements = doc.getElementsByTagName('*');
  const containers: Element[] = [];
  
  for (const element of allElements) {
    if (isTextContainer(element)) {
      containers.push(element);
    }
  }
  
  for (const container of containers) {
    processTextContainer(container, replacements, doc);
  }
  
  return new XMLSerializer().serializeToString(doc);
}

export async function generateInvoiceOdt(
  templatePath: string, 
  outputPath: string, 
  replacements: Record<string, string>
): Promise<void> {
  try {
    const templateData = await readFile(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    
    const contentFile = zip.file("content.xml");
    if (!contentFile) throw new Error("Invalid ODT: content.xml not found");
    
    let content = await contentFile.async("string");
    content = replaceInXml(content, replacements);
    zip.file("content.xml", content);
    
    const stylesFile = zip.file("styles.xml");
    if (stylesFile) {
      let styles = await stylesFile.async("string");
      styles = replaceInXml(styles, replacements);
      zip.file("styles.xml", styles);
    }
    
    const outputData = await zip.generateAsync({ type: "uint8array" });
    await writeFile(outputPath, outputData);
  } catch (e) {
    console.error("Error generating ODT:", e);
    throw e;
  }
}

export async function convertToPdf(odtPath: string, outputDir: string, sofficePath?: string): Promise<void> {
  console.log(`Converting ${odtPath} to PDF in ${outputDir}`);
  const soffice = sofficePath || 'soffice';
  const os = platform();
  
  const command = os === 'windows'
    ? Command.create('powershell', [
        '-NoProfile',
        '-Command',
        `& '${soffice}' --headless --nologo --nodefault --norestore --convert-to pdf '${odtPath}' --outdir '${outputDir}'`
      ])
    : Command.create('sh', [
        '-c',
        `'${soffice}' --headless --nologo --nodefault --norestore --convert-to pdf '${odtPath}' --outdir '${outputDir}'`
      ]);
  
  const output = await command.execute();
  if (output.code !== 0) {
    console.error("LibreOffice conversion failed:", output.stderr);
    throw new Error(`Conversion failed: ${output.stderr}`);
  }
}
