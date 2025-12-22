/**
 * PIG Project Repository Types
 * 
 * A PIG repository is structured as:
 * - .pig/                      (config folder)
 *   - cfg.json                 (main configuration)
 *   - *.enc                    (encrypted credentials)
 * - invoices/                  (customizable name)
 *   - 24/, 25/, 2024/, 2025/   (year folders)
 * - reimburse/pending/         (customizable path)
 * - reimburse/done/            (customizable path)
 */

export interface ProjectStructure {
  /** Name of the invoices folder (default: "invoices") */
  invoicesFolder: string;
  /** Path to pending reimbursements folder from root (default: "reimburse/pending") */
  reimbursePendingFolder: string;
  /** Path to completed reimbursements folder from root (default: "reimburse/done") */
  reimburseDoneFolder: string;
}

export const DEFAULT_PROJECT_STRUCTURE: ProjectStructure = {
  invoicesFolder: 'invoices',
  reimbursePendingFolder: 'reimburse/pending',
  reimburseDoneFolder: 'reimburse/done',
};

/** Alternative naming patterns we should recognize (for migration) */
export const LEGACY_FOLDER_NAMES = {
  reimbursePendingFolder: ['proplaceni/proplatit', 'proplatit'],
  reimburseDoneFolder: ['proplaceni/proplaceno', 'proplaceno'],
} as const;

export interface ProjectMetadata {
  /** Unique project ID (generated on creation) */
  id: string;
  /** User-friendly project name */
  name: string;
  /** Absolute path to project root */
  path: string;
  /** When the project was last opened */
  lastOpened: string; // ISO date string
  /** Whether this is also a git repository */
  isGitRepo: boolean;
  /** Custom folder structure configuration */
  structure: ProjectStructure;
}

export interface RecentProject {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
  /** Whether the path still exists and is valid */
  isValid?: boolean;
  /** Whether it's a git repository */
  isGitRepo?: boolean;
}

export interface ProjectStore {
  /** Currently active project ID */
  activeProjectId: string | null;
  /** List of recently opened projects */
  recentProjects: RecentProject[];
}

export const DEFAULT_PROJECT_STORE: ProjectStore = {
  activeProjectId: null,
  recentProjects: [],
};

export interface RepositoryValidationResult {
  /** Whether the path is a valid PIG repository */
  isValid: boolean;
  /** Whether .pig folder exists */
  hasPigFolder: boolean;
  /** Whether cfg.json exists in .pig or at root */
  hasConfig: boolean;
  /** Whether .git folder exists */
  isGitRepo: boolean;
  /** Detected project structure (if valid) */
  structure?: ProjectStructure;
  /** Project name from config or folder name */
  projectName?: string;
  /** Error message if invalid */
  error?: string;
  /** Whether using legacy config at root (not in .pig folder) */
  isLegacyConfig?: boolean;
}

/** Year folder patterns we recognize */
export const YEAR_FOLDER_PATTERNS = {
  /** Short format: "24", "25" */
  short: /^(\d{2})$/,
  /** Long format: "2024", "2025" */
  long: /^(20\d{2})$/,
};

/**
 * Parse a year folder name and return the full year
 */
export function parseYearFolder(folderName: string): number | null {
  const shortMatch = folderName.match(YEAR_FOLDER_PATTERNS.short);
  if (shortMatch) {
    const shortYear = parseInt(shortMatch[1], 10);
    // Assume 20xx for years 00-99
    return 2000 + shortYear;
  }
  
  const longMatch = folderName.match(YEAR_FOLDER_PATTERNS.long);
  if (longMatch) {
    return parseInt(longMatch[1], 10);
  }
  
  return null;
}

/**
 * Get the short year format from a full year
 */
export function getShortYear(year: number): string {
  return (year % 100).toString().padStart(2, '0');
}

