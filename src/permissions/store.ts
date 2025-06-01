import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { StoredPermission, PermissionRequest } from './types.js';

const STORE_DIR = join(homedir(), '.kiln');
const STORE_FILE = join(STORE_DIR, 'permissions.json');

function escapeRegExp(str: string): string {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function patternToRegex(pattern: string): RegExp {
  const regexStr = escapeRegExp(pattern)
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${regexStr}$`);
}

export class PermissionStore {
  private permissions: Map<string, StoredPermission> = new Map();

  constructor(private storePath: string = STORE_FILE) {
    this.load();
  }

  private load(): void {
    if (!existsSync(this.storePath)) {
      return;
    }

    try {
      const raw = readFileSync(this.storePath, 'utf-8');
      const data: Record<string, StoredPermission> = JSON.parse(raw);
      this.permissions = new Map(Object.entries(data));
    } catch {
      this.permissions = new Map();
    }
  }

  private save(): void {
    const dir = join(this.storePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data: Record<string, StoredPermission> = {};
    for (const [key, value] of this.permissions) {
      data[key] = value;
    }

    writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  addPermission(key: string, pattern: string, type: PermissionRequest['type'], description?: string): void {
    this.permissions.set(key, {
      pattern,
      type,
      addedAt: new Date().toISOString(),
      description,
    });
    this.save();
  }

  removePermission(key: string): boolean {
    const existed = this.permissions.delete(key);
    if (existed) {
      this.save();
    }
    return existed;
  }

  listPermissions(): Array<StoredPermission & { key: string }> {
    return Array.from(this.permissions.entries()).map(([key, perm]) => ({
      ...perm,
      key,
    }));
  }

  isAllowed(request: PermissionRequest): boolean {
    for (const stored of this.permissions.values()) {
      if (stored.type !== request.type) {
        continue;
      }

      const regex = patternToRegex(stored.pattern);
      if (regex.test(request.target)) {
        return true;
      }
    }

    return false;
  }

  makeKey(request: PermissionRequest): string {
    return `${request.type}:${request.target}`;
  }

  makeWildcardKey(command: string): string {
    const firstWord = command.trim().split(/\s+/)[0];
    return `command:${firstWord} *`;
  }

  hasPermission(key: string): boolean {
    return this.permissions.has(key);
  }

  clear(): void {
    this.permissions.clear();
    this.save();
  }
}
