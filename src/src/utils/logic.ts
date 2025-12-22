import { readDir, exists, rename, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { ProjectStructure, DEFAULT_PROJECT_STRUCTURE } from '../types';

export interface FileEntry {
  name: string;
  path: string; // Full path
}

/**
 * Get files from the reimburse pending folder
 */
export async function getProplatitFiles(
  rootPath: string, 
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<FileEntry[]> {
  try {
    const pendingPath = await join(rootPath, structure.reimbursePendingFolder);
    
    if (await exists(pendingPath)) {
      const entries = await readDir(pendingPath);
      return entries
        .filter(e => e.isFile && e.name.toLowerCase().endsWith('.pdf'))
        .map(e => ({ name: e.name, path: `${pendingPath}\\${e.name}` }));
    }
  } catch (e) {
    console.error("Error scanning reimburse pending folder:", e);
  }
  return [];
}

/**
 * Move a file from pending to done folder
 */
export async function moveProplatitFile(
  rootPath: string, 
  fileName: string,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<void> {
  const pendingPath = await join(rootPath, structure.reimbursePendingFolder);
  const donePath = await join(rootPath, structure.reimburseDoneFolder);
  
  const src = await join(pendingPath, fileName);
  const dest = await join(donePath, fileName);
  
  // Ensure destination directory exists
  if (!await exists(donePath)) {
    await mkdir(donePath, { recursive: true });
  }
  
  await rename(src, dest);
}

/**
 * Get date information for invoicing
 */
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

/**
 * Get the invoices folder path
 */
export async function getInvoicesPath(
  rootPath: string, 
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<string> {
  return await join(rootPath, structure.invoicesFolder);
}

/**
 * Get the year folder path inside invoices
 * Supports both short (24, 25) and long (2024, 2025) year formats
 */
export async function getYearFolderPath(
  rootPath: string, 
  year: number | string,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<string> {
  const invoicesPath = await getInvoicesPath(rootPath, structure);
  const yearStr = typeof year === 'number' 
    ? (year % 100).toString().padStart(2, '0') 
    : year;
  return await join(invoicesPath, yearStr);
}

/**
 * Ensure year folder exists, trying both short and long formats
 */
export async function ensureYearFolder(
  rootPath: string,
  year: number,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<string> {
  const invoicesPath = await getInvoicesPath(rootPath, structure);
  
  // Check short format first (24, 25)
  const shortYear = (year % 100).toString().padStart(2, '0');
  const shortPath = await join(invoicesPath, shortYear);
  if (await exists(shortPath)) {
    return shortPath;
  }
  
  // Check long format (2024, 2025)
  const longPath = await join(invoicesPath, year.toString());
  if (await exists(longPath)) {
    return longPath;
  }
  
  // Create short format by default
  await mkdir(shortPath, { recursive: true });
  return shortPath;
}

/**
 * Find existing year folder (checks both short and long formats)
 */
export async function findYearFolder(
  rootPath: string,
  year: number,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<string | null> {
  const invoicesPath = await getInvoicesPath(rootPath, structure);
  
  // Check short format first (24, 25)
  const shortYear = (year % 100).toString().padStart(2, '0');
  const shortPath = await join(invoicesPath, shortYear);
  if (await exists(shortPath)) {
    return shortPath;
  }
  
  // Check long format (2024, 2025)
  const longPath = await join(invoicesPath, year.toString());
  if (await exists(longPath)) {
    return longPath;
  }
  
  return null;
}

/**
 * Get the count of existing invoices for a specific month
 */
export async function getExistingInvoiceCount(
  rootPath: string, 
  yearShort: string, 
  month: string,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<number> {
  const yearFolder = await findYearFolder(rootPath, 2000 + parseInt(yearShort), structure);
  
  if (!yearFolder) {
    return 0;
  }
  
  let count = 0;
  try {
    const entries = await readDir(yearFolder);
    const regex = new RegExp(`faktura_.*_${yearShort}_${month}(?:_(\\d+))?\.pdf$`);
    
    for (const entry of entries) {
      if (entry.isFile && regex.test(entry.name)) {
        count++;
      }
    }
  } catch (e) {
    // Year dir might not exist yet
  }
  return count;
}

/**
 * Get the last invoiced month for a year
 */
export async function getLastInvoicedMonth(
  rootPath: string, 
  yearShort: string,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<number> {
  const yearFolder = await findYearFolder(rootPath, 2000 + parseInt(yearShort), structure);
  
  if (!yearFolder) {
    return 0;
  }
  
  let maxMonth = 0;
  try {
    const entries = await readDir(yearFolder);
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
  } catch (e) {
    // Year dir might not exist
  }
  return maxMonth;
}

/**
 * List all year folders in the invoices directory
 */
export async function listYearFolders(
  rootPath: string,
  structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE
): Promise<{ year: number; path: string; format: 'short' | 'long' }[]> {
  const years: { year: number; path: string; format: 'short' | 'long' }[] = [];
  
  try {
    const invoicesPath = await getInvoicesPath(rootPath, structure);
    
    if (await exists(invoicesPath)) {
      const entries = await readDir(invoicesPath);
      
      for (const entry of entries) {
        if (entry.isDirectory) {
          // Check short format (24, 25)
          const shortMatch = entry.name.match(/^(\d{2})$/);
          if (shortMatch) {
            const year = 2000 + parseInt(shortMatch[1], 10);
            years.push({ 
              year, 
              path: await join(invoicesPath, entry.name),
              format: 'short'
            });
            continue;
          }
          
          // Check long format (2024, 2025)
          const longMatch = entry.name.match(/^(20\d{2})$/);
          if (longMatch) {
            years.push({ 
              year: parseInt(longMatch[1], 10), 
              path: await join(invoicesPath, entry.name),
              format: 'long'
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("Error listing year folders:", e);
  }
  
  return years.sort((a, b) => b.year - a.year);
}
