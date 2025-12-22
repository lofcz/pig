import { readDir, exists, rename } from '@tauri-apps/plugin-fs';

export interface FileEntry {
  name: string;
  path: string; // Full path? or relative
}

const SEP = "\\"; // Windows separator, assuming Windows environment as per prompt

export async function getProplatitFiles(rootPath: string): Promise<FileEntry[]> {
  const path = `${rootPath}${SEP}proplaceni${SEP}proplatit`;
  try {
    if (await exists(path)) {
      const entries = await readDir(path);
      return entries
        .filter(e => e.isFile && e.name.toLowerCase().endsWith('.pdf'))
        .map(e => ({ name: e.name, path: `${path}${SEP}${e.name}` }));
    }
  } catch (e) {
    console.error("Error scanning proplatit:", e);
  }
  return [];
}

export async function moveProplatitFile(rootPath: string, fileName: string): Promise<void> {
    const src = `${rootPath}${SEP}proplaceni${SEP}proplatit${SEP}${fileName}`;
    const destDir = `${rootPath}${SEP}proplaceni${SEP}proplaceno`;
    // Ensure dest dir exists? Assuming it does based on structure
    const dest = `${destDir}${SEP}${fileName}`;
    await rename(src, dest);
}

export function getMonthDates(year: number, month: number, count: number): { 
  issueDateStr: string; // D. M. YYYY
  invoiceNo: string; // DDMMYYYY
  day: string;
  monthYear: string;
} {
  // Month is 1-12
  // Last day of month
  const date = new Date(year, month, 0); // Day 0 of next month = last day of this month
  // Subtract 'count' days
  date.setDate(date.getDate() - count);
  
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  
  return {
    issueDateStr: `${d}. ${m}. ${y}`,
    invoiceNo: `${d.toString().padStart(2, '0')}${m.toString().padStart(2, '0')}${y}`,
    day: d.toString(),
    monthYear: `${m}. ${y}`
  };
}

export async function getExistingInvoiceCount(rootPath: string, yearShort: string, month: string): Promise<number> {
    const yearDir = `${rootPath}${SEP}${yearShort}`;
    let count = 0;
    try {
        if (await exists(yearDir)) {
            const entries = await readDir(yearDir);
            const regex = new RegExp(`faktura_.*_${yearShort}_${month}(?:_(\\d+))?\.pdf$`); // relaxed company matching
            
            for (const entry of entries) {
                if (entry.isFile && regex.test(entry.name)) {
                   count++; 
                }
            }
        }
    } catch (e) {
        // Year dir might not exist yet
    }
    return count;
}

export async function getLastInvoicedMonth(rootPath: string, yearShort: string): Promise<number> {
    const yearDir = `${rootPath}${SEP}${yearShort}`;
    let maxMonth = 0;
    try {
        if (await exists(yearDir)) {
            const entries = await readDir(yearDir);
            // faktura_..._YY_MM...
            const regex = new RegExp(`faktura_.*_${yearShort}_(\\d{2})`);
            
            for (const entry of entries) {
                if (entry.isFile) {
                    const match = entry.name.match(regex);
                    if (match) {
                        const m = parseInt(match[1]);
                        if (m > maxMonth) maxMonth = m;
                    }
                }
            }
        }
    } catch (e) {
        // Year dir might not exist
    }
    return maxMonth;
}
