import { readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs';

// SMTP Credentials - stored separately and encrypted for security
// Maps connector ID to password
export interface SmtpCredentials {
  [connectorId: string]: string;
}

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

export async function loadSmtpCredentials(): Promise<SmtpCredentials> {
  try {
    if (await exists(SMTP_CREDENTIALS_FILE)) {
      const encrypted = await readTextFile(SMTP_CREDENTIALS_FILE);
      return decryptSmtpCredentials(encrypted);
    }
  } catch (e) {
    console.warn("SMTP credentials file not found or invalid:", e);
  }
  return {};
}

export async function saveSmtpCredentials(credentials: SmtpCredentials): Promise<void> {
  try {
    const encrypted = encryptSmtpCredentials(credentials);
    await writeTextFile(SMTP_CREDENTIALS_FILE, encrypted);
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

