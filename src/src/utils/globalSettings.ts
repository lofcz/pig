/**
 * Global Settings - App-wide settings stored in localStorage
 * 
 * These settings apply across all projects:
 * - Appearance (theme)
 * - LibreOffice path
 */

import { exists } from '@tauri-apps/plugin-fs';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface GlobalSettings {
  /** Theme preference */
  theme: ThemePreference;
  /** Path to LibreOffice soffice executable */
  sofficePath?: string;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  theme: 'system',
  sofficePath: undefined,
};

const STORAGE_KEY = 'pig_global_settings';

/**
 * Load global settings from localStorage
 */
export function loadGlobalSettings(): GlobalSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_GLOBAL_SETTINGS,
        ...parsed,
      };
    }
  } catch (error) {
    console.warn('Failed to load global settings:', error);
  }
  return { ...DEFAULT_GLOBAL_SETTINGS };
}

/**
 * Save global settings to localStorage
 */
export function saveGlobalSettings(settings: GlobalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save global settings:', error);
  }
}

/**
 * Update a single global setting
 */
export function updateGlobalSetting<K extends keyof GlobalSettings>(
  key: K,
  value: GlobalSettings[K]
): GlobalSettings {
  const current = loadGlobalSettings();
  const updated = { ...current, [key]: value };
  saveGlobalSettings(updated);
  return updated;
}

/**
 * Common paths to check for LibreOffice
 */
export const SOFFICE_COMMON_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 7\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 24\\program\\soffice.exe',
  'C:\\Program Files\\OpenOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\OpenOffice\\program\\soffice.exe',
];

/**
 * Auto-detect LibreOffice installation
 */
export async function autoDetectSoffice(): Promise<string | null> {
  for (const path of SOFFICE_COMMON_PATHS) {
    if (await exists(path)) {
      return path;
    }
  }
  return null;
}

