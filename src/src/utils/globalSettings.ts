/**
 * Global Settings - App-wide settings stored in localStorage
 * 
 * These settings apply across all projects:
 * - Appearance (theme)
 * - LibreOffice path
 */

import { exists, stat } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

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

export type SofficeConfigurationResult =
  | { valid: true; path: string }
  | { valid: false; message: string };

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

/**
 * Validate the app-wide LibreOffice setting before starting a preview.
 * Requiring an explicit, existing executable avoids handing an invalid path
 * to the native shell and lets the UI surface an actionable error instead.
 */
export async function validateSofficeConfiguration(): Promise<SofficeConfigurationResult> {
  const path = loadGlobalSettings().sofficePath?.trim();

  if (!path) {
    return {
      valid: false,
      message: 'PDF generation requires LibreOffice. Configure soffice.exe in Settings → General.',
    };
  }

  const executableName = path.replace(/\\/g, '/').split('/').pop()?.toLowerCase();
  if (executableName !== 'soffice.exe' && executableName !== 'soffice') {
    return {
      valid: false,
      message: 'The LibreOffice setting must point to soffice.exe. Update it in Settings → General.',
    };
  }

  try {
    const fileInfo = await stat(path);
    if (!fileInfo.isFile) {
      return {
        valid: false,
        message: 'The LibreOffice setting must point to the soffice executable. Update it in Settings → General.',
      };
    }
  } catch (error) {
    console.warn('Failed to validate LibreOffice path:', error);
    return {
      valid: false,
      message: 'The configured LibreOffice path no longer exists. Update it in Settings → General.',
    };
  }

  try {
    await invoke('validate_soffice', { path });
  } catch (error) {
    console.warn('Configured LibreOffice validation failed:', error);
    return {
      valid: false,
      message: `${String(error)} Check its path in Settings → General.`,
    };
  }

  return { valid: true, path };
}

