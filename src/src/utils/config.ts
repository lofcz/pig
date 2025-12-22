import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { Config, DEFAULT_CONFIG, DEFAULT_PROJECT_STRUCTURE } from '../types';

const PIG_FOLDER = '.pig';
const CONFIG_FILE = 'cfg.json';

/**
 * Get the config file path for a given root path
 * Checks .pig/cfg.json first, then falls back to root cfg.json
 */
export async function getConfigPath(rootPath: string): Promise<string> {
  // Check new location first (.pig/cfg.json)
  const pigConfigPath = await join(rootPath, PIG_FOLDER, CONFIG_FILE);
  if (await exists(pigConfigPath)) {
    return pigConfigPath;
  }
  
  // Check legacy location (cfg.json at root)
  const legacyConfigPath = await join(rootPath, CONFIG_FILE);
  if (await exists(legacyConfigPath)) {
    return legacyConfigPath;
  }
  
  // Default to new location (for creation)
  return pigConfigPath;
}

/**
 * Check if a path has a valid PIG config (in either location)
 */
export async function hasValidConfig(rootPath: string): Promise<boolean> {
  try {
    // Check .pig/cfg.json
    const pigConfigPath = await join(rootPath, PIG_FOLDER, CONFIG_FILE);
    if (await exists(pigConfigPath)) {
      return true;
    }
    
    // Check root cfg.json
    const legacyConfigPath = await join(rootPath, CONFIG_FILE);
    if (await exists(legacyConfigPath)) {
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

/**
 * Load config from a specific project root path
 * Supports both .pig/cfg.json and legacy root cfg.json
 */
export async function loadConfigFromPath(rootPath: string): Promise<Config> {
  try {
    const configPath = await getConfigPath(rootPath);
    
    if (await exists(configPath)) {
      const content = await readTextFile(configPath);
      const loaded = JSON.parse(content);
      
      // Basic schema validation check (migration)
      if (loaded.companies && !Array.isArray(loaded.companies)) {
        console.warn("Config schema mismatch (companies is not array), using defaults.");
        return { ...DEFAULT_CONFIG, rootPath };
      }

      // Ensure rootPath is set correctly
      loaded.rootPath = rootPath;

      // Migration: Move salaryRules into rulesets if needed
      if ((loaded as any).salaryRules && loaded.rulesets && loaded.rulesets.length > 0 && !loaded.rulesets[0].salaryRules) {
        console.log("Migrating salaryRules to rulesets...");
        loaded.rulesets[0].salaryRules = (loaded as any).salaryRules;
        loaded.rulesets[0].periodicity = 'monthly';
        loaded.rulesets[0].entitlementDay = 5;
        delete (loaded as any).salaryRules;
      }

      // Migration: Move descriptions into rulesets if needed
      if ((loaded as any).descriptions && loaded.rulesets && loaded.rulesets.length > 0 && !loaded.rulesets[0].descriptions) {
        console.log("Migrating descriptions to rulesets...");
        loaded.rulesets[0].descriptions = (loaded as any).descriptions;
        delete (loaded as any).descriptions;
      }

      // Ensure all rulesets have new fields
      if (loaded.rulesets) {
        loaded.rulesets = loaded.rulesets.map((r: any) => ({
          ...r,
          salaryRules: r.salaryRules || [],
          periodicity: r.periodicity || 'monthly',
          entitlementDay: r.entitlementDay !== undefined ? r.entitlementDay : 5,
          descriptions: r.descriptions || [],
          minimizeInvoices: !!r.minimizeInvoices
        }));
      }

      // Ensure emailConnectors array exists
      if (!loaded.emailConnectors) {
        loaded.emailConnectors = [];
      }

      // Ensure projectStructure exists and normalize it
      let projectStructure = { ...DEFAULT_PROJECT_STRUCTURE };
      if (loaded.projectStructure) {
        projectStructure = {
          ...DEFAULT_PROJECT_STRUCTURE,
          ...loaded.projectStructure,
        };
      }

      // Merge with default to ensure all fields exist
      return { 
        ...DEFAULT_CONFIG, 
        ...loaded, 
        projectStructure,
        exchangeRates: { ...DEFAULT_CONFIG.exchangeRates, ...loaded.exchangeRates } 
      };
    }
  } catch (e) {
    console.warn("Config file not found or invalid, using defaults:", e);
  }
  return { ...DEFAULT_CONFIG, rootPath };
}

/**
 * Legacy: Load config from current directory (for backwards compatibility)
 * This will be deprecated in favor of loadConfigFromPath
 */
export async function loadConfig(): Promise<Config> {
  // Try to load from current directory's cfg.json first (legacy support)
  try {
    if (await exists(CONFIG_FILE)) {
      const content = await readTextFile(CONFIG_FILE);
      const loaded = JSON.parse(content);
      
      // If it has a rootPath, try to load from that path
      if (loaded.rootPath) {
        const configExists = await hasValidConfig(loaded.rootPath);
        if (configExists) {
          return loadConfigFromPath(loaded.rootPath);
        }
      }
      
      // Basic schema validation check (migration)
      if (loaded.companies && !Array.isArray(loaded.companies)) {
        console.warn("Config schema mismatch (companies is not array), using defaults.");
        return DEFAULT_CONFIG;
      }

      // Migration: Move salaryRules into rulesets if needed
      if ((loaded as any).salaryRules && loaded.rulesets && loaded.rulesets.length > 0 && !loaded.rulesets[0].salaryRules) {
        console.log("Migrating salaryRules to rulesets...");
        loaded.rulesets[0].salaryRules = (loaded as any).salaryRules;
        loaded.rulesets[0].periodicity = 'monthly';
        loaded.rulesets[0].entitlementDay = 5;
        delete (loaded as any).salaryRules;
      }

      // Migration: Move descriptions into rulesets if needed
      if ((loaded as any).descriptions && loaded.rulesets && loaded.rulesets.length > 0 && !loaded.rulesets[0].descriptions) {
        console.log("Migrating descriptions to rulesets...");
        loaded.rulesets[0].descriptions = (loaded as any).descriptions;
        delete (loaded as any).descriptions;
      }

      // Ensure all rulesets have new fields
      if (loaded.rulesets) {
        loaded.rulesets = loaded.rulesets.map((r: any) => ({
          ...r,
          salaryRules: r.salaryRules || [],
          periodicity: r.periodicity || 'monthly',
          entitlementDay: r.entitlementDay !== undefined ? r.entitlementDay : 5,
          descriptions: r.descriptions || [],
          minimizeInvoices: !!r.minimizeInvoices
        }));
      }

      // Ensure emailConnectors array exists
      if (!loaded.emailConnectors) {
        loaded.emailConnectors = [];
      }

      // Ensure projectStructure exists and normalize it
      let projectStructure = { ...DEFAULT_PROJECT_STRUCTURE };
      if (loaded.projectStructure) {
        projectStructure = {
          ...DEFAULT_PROJECT_STRUCTURE,
          ...loaded.projectStructure,
        };
      }

      // Merge with default to ensure all fields exist
      return { 
        ...DEFAULT_CONFIG, 
        ...loaded, 
        projectStructure,
        exchangeRates: { ...DEFAULT_CONFIG.exchangeRates, ...loaded.exchangeRates } 
      };
    }
  } catch (e) {
    console.warn("Config file not found or invalid, using defaults:", e);
  }
  return DEFAULT_CONFIG;
}

/**
 * Save config to project's config file
 * Uses .pig/cfg.json if it exists, otherwise saves to root cfg.json
 */
export async function saveConfigToPath(config: Config): Promise<void> {
  if (!config.rootPath) {
    throw new Error("Cannot save config: rootPath is not set");
  }
  
  try {
    const configPath = await getConfigPath(config.rootPath);
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Failed to save config:", e);
    throw e;
  }
}

/**
 * Legacy: Save config - saves to the location where config was found
 */
export async function saveConfig(config: Config): Promise<void> {
  // If we have a rootPath, save there
  if (config.rootPath) {
    try {
      await saveConfigToPath(config);
      return;
    } catch (e) {
      console.warn("Could not save to project folder, falling back to local:", e);
    }
  }
  
  // Fallback to local cfg.json (legacy behavior)
  try {
    await writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Failed to save config:", e);
    throw e;
  }
}

