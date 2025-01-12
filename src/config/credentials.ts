import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfigDir } from './loader.js';
import { CredentialsSchema, type Credentials } from './schema.js';

const CREDENTIALS_FILE = 'credentials.json';

function getCredentialsPath(): string {
  return resolve(getConfigDir(), CREDENTIALS_FILE);
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readCredentials(): Credentials {
  const path = getCredentialsPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return CredentialsSchema.parse(raw);
  } catch {
    return {};
  }
}

function writeCredentials(creds: Credentials): void {
  ensureConfigDir();
  const path = getCredentialsPath();
  writeFileSync(path, JSON.stringify(creds, null, 2), 'utf-8');
  restrictPermissions(path);
}

function restrictPermissions(filePath: string): void {
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Non-critical: warn but don't fail on platforms without chmod support
  }
}

function checkPermissions(): void {
  const path = getCredentialsPath();
  if (!existsSync(path)) {
    return;
  }

  try {
    const stat = statSync(path);
    const mode = stat.mode;

    const worldReadable = (mode & 0o004) !== 0;
    const groupReadable = (mode & 0o040) !== 0;

    if (worldReadable || groupReadable) {
      console.warn(
        `Warning: ${path} has permissive file permissions (${(mode & 0o777).toString(8)}). ` +
          `Consider running: chmod 600 ${path}`,
      );
    }
  } catch {
    // Ignore permission check errors
  }
}

export function setCredential(provider: string, key: string): void {
  const creds = readCredentials();
  creds[provider] = key;
  writeCredentials(creds);
}

export function getCredential(provider: string): string | undefined {
  checkPermissions();
  const creds = readCredentials();
  return creds[provider];
}

export function removeCredential(provider: string): boolean {
  const creds = readCredentials();
  if (!(provider in creds)) {
    return false;
  }
  delete creds[provider];
  writeCredentials(creds);
  return true;
}

export function listCredentials(): string[] {
  checkPermissions();
  const creds = readCredentials();
  return Object.keys(creds).filter((k) => creds[k] && creds[k]!.length > 0);
}

export function hasCredential(provider: string): boolean {
  const key = getCredential(provider);
  return key !== undefined && key.length > 0;
}
