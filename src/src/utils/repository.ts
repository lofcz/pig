/**
 * PIG Repository Detection and Validation
 */

import { exists, readDir, readTextFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import {
  ProjectStructure,
  DEFAULT_PROJECT_STRUCTURE,
  RepositoryValidationResult,
  parseYearFolder,
} from '../types/project';

const PIG_FOLDER = '.pig';
const CONFIG_FILE = 'cfg.json';
const GIT_FOLDER = '.git';


/**
 * Check if a path is a valid PIG repository
 * Supports both new (.pig/cfg.json) and legacy (cfg.json at root) locations
 */
export async function validateRepository(rootPath: string): Promise<RepositoryValidationResult> {
  try {
    // Check if .pig folder exists (new format)
    const pigFolderPath = await join(rootPath, PIG_FOLDER);
    const hasPigFolder = await exists(pigFolderPath);
    
    // Check for config in .pig folder (new format)
    const pigConfigPath = await join(pigFolderPath, CONFIG_FILE);
    const hasPigConfig = hasPigFolder && await exists(pigConfigPath);
    
    // Check for legacy config at root
    const legacyConfigPath = await join(rootPath, CONFIG_FILE);
    const hasLegacyConfig = await exists(legacyConfigPath);
    
    // Determine which config to use
    const configPath = hasPigConfig ? pigConfigPath : (hasLegacyConfig ? legacyConfigPath : null);
    const hasConfig = configPath !== null;
    
    if (!hasConfig) {
      return {
        isValid: false,
        hasPigFolder,
        hasConfig: false,
        isGitRepo: await checkIsGitRepo(rootPath),
        error: 'Not a PIG repository: cfg.json not found',
      };
    }
    
    // Check for git repository
    const isGitRepo = await checkIsGitRepo(rootPath);
    
    // Try to read and parse config to get structure
    let structure: ProjectStructure = DEFAULT_PROJECT_STRUCTURE;
    let projectName: string | undefined;
    
    try {
      const configContent = await readTextFile(configPath);
      const config = JSON.parse(configContent);
      
      if (config.projectStructure) {
        structure = {
          ...DEFAULT_PROJECT_STRUCTURE,
          ...config.projectStructure,
        };
      }
      
      projectName = config.projectName;
    } catch {
      // Config exists but couldn't be parsed - still valid but use defaults
    }
    
    // If no project name in config, use folder name
    if (!projectName) {
      const pathParts = rootPath.replace(/\\/g, '/').split('/');
      projectName = pathParts[pathParts.length - 1] || 'Unnamed Project';
    }
    
    return {
      isValid: true,
      hasPigFolder,
      hasConfig: true,
      isGitRepo,
      structure,
      projectName,
      // Flag if using legacy config (for potential migration prompt)
      isLegacyConfig: !hasPigConfig && hasLegacyConfig,
    };
  } catch (error) {
    return {
      isValid: false,
      hasPigFolder: false,
      hasConfig: false,
      isGitRepo: false,
      error: `Failed to validate repository: ${error}`,
    };
  }
}

/**
 * Check if a directory is a git repository
 */
export async function checkIsGitRepo(rootPath: string): Promise<boolean> {
  try {
    const gitPath = await join(rootPath, GIT_FOLDER);
    return await exists(gitPath);
  } catch {
    return false;
  }
}

/**
 * Detect project structure from existing folders (for migration)
 */
export async function detectExistingStructure(rootPath: string): Promise<ProjectStructure> {
  const structure: ProjectStructure = { ...DEFAULT_PROJECT_STRUCTURE };
  
  try {
    const entries = await readDir(rootPath);
    const folderNames = entries
      .filter(e => e.isDirectory)
      .map(e => e.name.toLowerCase());
    
    // Detect invoices folder
    if (folderNames.includes('invoices')) {
      structure.invoicesFolder = 'invoices';
    } else if (folderNames.includes('faktury')) {
      structure.invoicesFolder = 'faktury';
    }
    
    // Detect reimburse folders - check common patterns
    // Check for proplaceni/proplatit and proplaceni/proplaceno (legacy Czech names)
    if (folderNames.includes('proplaceni')) {
      const reimbursePath = await join(rootPath, 'proplaceni');
      if (await exists(reimbursePath)) {
        const subEntries = await readDir(reimbursePath);
        const subFolderNames = subEntries
          .filter(e => e.isDirectory)
          .map(e => e.name.toLowerCase());
        
        if (subFolderNames.includes('proplatit')) {
          structure.reimbursePendingFolder = 'proplaceni/proplatit';
        }
        if (subFolderNames.includes('proplaceno')) {
          structure.reimburseDoneFolder = 'proplaceni/proplaceno';
        }
      }
    }
    
    // Check for reimburse/pending and reimburse/done
    if (folderNames.includes('reimburse')) {
      const reimbursePath = await join(rootPath, 'reimburse');
      if (await exists(reimbursePath)) {
        const subEntries = await readDir(reimbursePath);
        const subFolderNames = subEntries
          .filter(e => e.isDirectory)
          .map(e => e.name.toLowerCase());
        
        if (subFolderNames.includes('pending')) {
          structure.reimbursePendingFolder = 'reimburse/pending';
        }
        if (subFolderNames.includes('done')) {
          structure.reimburseDoneFolder = 'reimburse/done';
        }
      }
    }
  } catch {
    // Return defaults on error
  }
  
  return structure;
}

/**
 * Detect year folders in the invoices directory
 */
export async function detectYearFolders(rootPath: string, structure: ProjectStructure): Promise<number[]> {
  const years: number[] = [];
  
  try {
    const invoicesPath = await join(rootPath, structure.invoicesFolder);
    
    if (await exists(invoicesPath)) {
      const entries = await readDir(invoicesPath);
      
      for (const entry of entries) {
        if (entry.isDirectory) {
          const year = parseYearFolder(entry.name);
          if (year !== null) {
            years.push(year);
          }
        }
      }
    }
  } catch {
    // Return empty on error
  }
  
  return years.sort((a, b) => b - a); // Most recent first
}

/**
 * Scaffold a new PIG repository structure
 */
export async function scaffoldRepository(
  rootPath: string,
  projectName: string,
  structure: ProjectStructure
): Promise<void> {
  // Create .pig folder
  const pigPath = await join(rootPath, PIG_FOLDER);
  await mkdir(pigPath, { recursive: true });
  
  // Create initial cfg.json
  const configPath = await join(pigPath, CONFIG_FILE);
  const initialConfig = {
    projectName,
    projectStructure: structure,
    rootPath, // Keep for backwards compatibility during transition
    contacts: [],
    companies: [],
    emailTemplates: [],
    emailConnectors: [],
    rulesets: [],
    primaryCurrency: 'CZK',
    exchangeRates: {
      EUR: 25,
      USD: 23,
      CZK: 1,
    },
    theme: 'system',
  };
  await writeTextFile(configPath, JSON.stringify(initialConfig, null, 2));
  
  // Create invoices folder
  const invoicesPath = await join(rootPath, structure.invoicesFolder);
  await mkdir(invoicesPath, { recursive: true });
  
  // Create current year folder
  const currentYear = new Date().getFullYear();
  const shortYear = (currentYear % 100).toString().padStart(2, '0');
  const yearPath = await join(invoicesPath, shortYear);
  await mkdir(yearPath, { recursive: true });
  
  // Create reimburse folders (paths are relative to root)
  const pendingPath = await join(rootPath, structure.reimbursePendingFolder);
  await mkdir(pendingPath, { recursive: true });
  
  const donePath = await join(rootPath, structure.reimburseDoneFolder);
  await mkdir(donePath, { recursive: true });
}

/**
 * Get the config file path for a repository (checks both new and legacy locations)
 */
export async function getConfigPath(rootPath: string): Promise<string> {
  // Check new location first
  const pigConfigPath = await join(rootPath, PIG_FOLDER, CONFIG_FILE);
  if (await exists(pigConfigPath)) {
    return pigConfigPath;
  }
  
  // Fall back to legacy location
  const legacyConfigPath = await join(rootPath, CONFIG_FILE);
  if (await exists(legacyConfigPath)) {
    return legacyConfigPath;
  }
  
  // Default to new location (for creation)
  return pigConfigPath;
}

/**
 * Get the .pig folder path
 */
export async function getPigFolderPath(rootPath: string): Promise<string> {
  return await join(rootPath, PIG_FOLDER);
}

/**
 * Get paths based on project structure
 */
export async function getProjectPaths(rootPath: string, structure: ProjectStructure) {
  return {
    pig: await join(rootPath, PIG_FOLDER),
    config: await getConfigPath(rootPath),
    invoices: await join(rootPath, structure.invoicesFolder),
    reimbursePending: await join(rootPath, structure.reimbursePendingFolder),
    reimburseDone: await join(rootPath, structure.reimburseDoneFolder),
  };
}
