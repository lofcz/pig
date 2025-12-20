import JSZip from 'jszip';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';

export async function generateInvoiceOdt(
  templatePath: string, 
  outputPath: string, 
  replacements: Record<string, string>
): Promise<void> {
  try {
    const templateData = await readFile(templatePath);
    const zip = await JSZip.loadAsync(templateData);
    
    const contentFile = zip.file("content.xml");
    if (!contentFile) throw new Error("Invalid ODT template: content.xml not found");
    
    let content = await contentFile.async("string");
    
    // Perform replacements
    for (const [key, value] of Object.entries(replacements)) {
      // Global replace for all occurrences
      // Escape regex special chars in key? key is usually {{KEY}}
      // Simple string replaceAll if available or regex
      content = content.split(key).join(value);
    }
    
    zip.file("content.xml", content);
    
    const outputData = await zip.generateAsync({ type: "uint8array" });
    await writeFile(outputPath, outputData);
  } catch (e) {
    console.error("Error generating ODT:", e);
    throw e;
  }
}

export async function convertToPdf(odtPath: string, outputDir: string): Promise<void> {
  // soffice --headless --convert-to pdf <file> --outdir <dir>
  console.log(`Converting ${odtPath} to PDF in ${outputDir}`);
  const command = Command.create('soffice', [
    '--headless',
    '--nologo',
    '--nodefault',
    '--norestore',
    '--convert-to', 'pdf',
    odtPath,
    '--outdir', outputDir
  ]);
  
  const output = await command.execute();
  if (output.code !== 0) {
    console.error("LibreOffice conversion failed:", output.stderr);
    throw new Error(`Conversion failed: ${output.stderr}`);
  }
}
