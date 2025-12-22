import { readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

// SMTP Credentials - stored separately and encrypted for security
// Maps connector ID to password
export interface SmtpCredentials {
  [connectorId: string]: string;
}

const PIG_FOLDER = '.pig';
const SMTP_CREDENTIALS_FILE = 'smtp_credentials.enc';

// Note: This is NOT cryptographically secure - it's just obfuscation
// to avoid storing plaintext passwords on disk. The key is public (OSS).
const ENCRYPTION_KEY = 'pig-sends-email-oink';

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

export function encryptSmtpCredentials(credentials: SmtpCredentials): string {
  const json = JSON.stringify(credentials);
  return xorEncrypt(json, ENCRYPTION_KEY);
}

export function decryptSmtpCredentials(encrypted: string): SmtpCredentials {
  try {
    const decrypted = xorDecrypt(encrypted, ENCRYPTION_KEY);
    return JSON.parse(decrypted);
  } catch {
    return {};
  }
}

/**
 * Get the path to the SMTP credentials file
 */
async function getCredentialsPath(rootPath: string): Promise<string> {
  return await join(rootPath, PIG_FOLDER, SMTP_CREDENTIALS_FILE);
}

/**
 * Load SMTP credentials from the project's .pig folder
 */
export async function loadSmtpCredentials(rootPath: string): Promise<SmtpCredentials> {
  if (!rootPath) {
    return {};
  }
  
  try {
    const credentialsPath = await getCredentialsPath(rootPath);
    if (await exists(credentialsPath)) {
      const encrypted = await readTextFile(credentialsPath);
      return decryptSmtpCredentials(encrypted);
    }
  } catch (e) {
    console.warn("SMTP credentials file not found or invalid:", e);
  }
  return {};
}

/**
 * Save SMTP credentials to the project's .pig folder
 */
export async function saveSmtpCredentials(rootPath: string, credentials: SmtpCredentials): Promise<void> {
  if (!rootPath) {
    throw new Error("Cannot save SMTP credentials: rootPath is not set");
  }
  
  try {
    // Ensure .pig folder exists
    const pigPath = await join(rootPath, PIG_FOLDER);
    if (!await exists(pigPath)) {
      await mkdir(pigPath, { recursive: true });
    }
    
    const credentialsPath = await getCredentialsPath(rootPath);
    const encrypted = encryptSmtpCredentials(credentials);
    await writeTextFile(credentialsPath, encrypted);
  } catch (e) {
    console.error("Failed to save SMTP credentials:", e);
    throw e;
  }
}

// Mask a password for display
export function maskPassword(password: string | undefined): string {
  if (!password) return '';
  if (password.length <= 4) return '••••';
  return '••••••••••••';
}
