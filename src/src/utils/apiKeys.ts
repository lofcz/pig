import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';

// Provider IDs
export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama';

// Default provider order
export const DEFAULT_PROVIDER_ORDER: ProviderId[] = ['openai', 'anthropic', 'gemini', 'ollama'];

// API Keys configuration - stored separately from main config for security
export interface APIKeysConfig {
  openai?: string;
  openaiModel?: string; // Custom model override
  anthropic?: string;
  anthropicModel?: string; // Custom model override
  gemini?: string;
  geminiModel?: string; // Custom model override
  ollama?: {
    model: string;
    host?: string; // defaults to http://localhost:11434
  };
  providerOrder?: ProviderId[]; // Order of providers (top = first to try)
}

const API_KEYS_FILE = 'api_keys.enc';

// Note: This is NOT cryptographically secure - it's just obfuscation
// to avoid storing plaintext API keys on disk. The key is public (OSS).
const ENCRYPTION_KEY = 'pig-with-three-eyes';

function xorEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  // Convert to base64 for safe storage
  return btoa(result);
}

function xorDecrypt(encoded: string, key: string): string {
  try {
    const decoded = atob(encoded);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch {
    return '';
  }
}

export function encryptAPIKeys(keys: APIKeysConfig): string {
  const json = JSON.stringify(keys);
  return xorEncrypt(json, ENCRYPTION_KEY);
}

export function decryptAPIKeys(encrypted: string): APIKeysConfig {
  try {
    const decrypted = xorDecrypt(encrypted, ENCRYPTION_KEY);
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
}

export async function loadAPIKeys(): Promise<APIKeysConfig> {
  try {
    if (await exists(API_KEYS_FILE)) {
      const encrypted = await readTextFile(API_KEYS_FILE);
      return decryptAPIKeys(encrypted);
    }
  } catch (e) {
    console.warn("API keys file not found or invalid:", e);
  }
  return {};
}

export async function saveAPIKeys(keys: APIKeysConfig): Promise<void> {
  try {
    const encrypted = encryptAPIKeys(keys);
    await writeTextFile(API_KEYS_FILE, encrypted);
  } catch (e) {
    console.error("Failed to save API keys:", e);
    throw e;
  }
}

// Mask an API key for display (show first 4 and last 4 chars)
export function maskAPIKey(key: string | undefined): string {
  if (!key || key.length < 12) return key ? '••••••••' : '';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

// Check if we have any API key configured
export function hasAnyAPIKey(keys: APIKeysConfig): boolean {
  return !!(keys.openai || keys.anthropic || keys.gemini || keys.ollama?.model);
}

// Get provider order (with defaults for any missing providers)
export function getProviderOrder(keys: APIKeysConfig): ProviderId[] {
  const order = keys.providerOrder || DEFAULT_PROVIDER_ORDER;
  // Ensure all providers are in the order (add any missing ones at the end)
  const missing = DEFAULT_PROVIDER_ORDER.filter(p => !order.includes(p));
  return [...order, ...missing];
}

// Check if a provider has valid credentials
export function isProviderConfigured(keys: APIKeysConfig, provider: ProviderId): boolean {
  if (provider === 'ollama') {
    return !!keys.ollama?.model;
  }
  return !!keys[provider];
}

// Provider display names and descriptions
export const API_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    description: 'OpenAI models',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o',
    modelPlaceholder: 'gpt-4o, gpt-4o-mini...',
  },
  anthropic: {
    name: 'Anthropic',
    description: 'Claude models',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-haiku-4-5',
    modelPlaceholder: 'claude-haiku-4-5, claude-sonnet-4-5...',
  },
  gemini: {
    name: 'Google',
    description: 'Gemini models',
    placeholder: 'Your API key',
    docsUrl: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-3-flash-preview',
    modelPlaceholder: 'gemini-3-flash-preview, gemini-2.5-pro...',
  },
  ollama: {
    name: 'Ollama',
    description: 'Local models',
    placeholder: 'llama3, mistral, qwen...',
    docsUrl: 'https://ollama.com',
    defaultModel: 'llama3',
    modelPlaceholder: 'llama3, mistral, qwen...',
  }
} as const;

