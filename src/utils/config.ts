import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';
import { Config, DEFAULT_CONFIG, ThemePreference } from '../types';

const CONFIG_FILE = 'cfg.json';

export async function loadConfig(): Promise<Config> {
  try {
    if (await exists(CONFIG_FILE)) {
      const content = await readTextFile(CONFIG_FILE);
      const loaded = JSON.parse(content);
      
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

      // Ensure contacts array exists (migration for older configs)
      if (!loaded.contacts) {
        loaded.contacts = [];
      }

      // Migration: Move bankAccount from Config to supplier
      if (loaded.bankAccount && loaded.companies) {
        const supplier = loaded.companies.find((c: any) => c.isSupplier);
        if (supplier && !supplier.bankAccount) {
          console.log("Migrating bankAccount to supplier...");
          supplier.bankAccount = loaded.bankAccount;
        }
        delete loaded.bankAccount;
      }

      // Migration: Move maxInvoiceValue from Config to rulesets
      if (loaded.maxInvoiceValue !== undefined && loaded.rulesets) {
        console.log("Migrating maxInvoiceValue to rulesets...");
        loaded.rulesets = loaded.rulesets.map((r: any) => ({
          ...r,
          maxInvoiceValue: r.maxInvoiceValue ?? loaded.maxInvoiceValue
        }));
        delete loaded.maxInvoiceValue;
      }

      // Merge with default to ensure all fields exist
      return { ...DEFAULT_CONFIG, ...loaded };
    }
  } catch (e) {
    console.warn("Config file not found or invalid, using defaults:", e);
  }
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: Config): Promise<void> {
  try {
    await writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("Failed to save config:", e);
    throw e;
  }
}

export async function saveTheme(theme: ThemePreference): Promise<void> {
  try {
    const config = await loadConfig();
    config.theme = theme;
    await saveConfig(config);
  } catch (e) {
    console.error("Failed to save theme:", e);
  }
}
