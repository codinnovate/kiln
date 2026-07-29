import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PermissionManager } from '../../src/permissions/manager.js';
import { PermissionStore } from '../../src/permissions/store.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-perm-int-'));
}

describe('PermissionStore integration', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    storePath = path.join(tmpDir, 'permissions.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists permissions to disk', () => {
    const store1 = new PermissionStore(storePath);
    store1.addPermission('test1', '/test/**', 'file_write', 'Write output');

    const store2 = new PermissionStore(storePath);
    const rules = store2.listPermissions();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.key).toBe('test1');
    expect(rules[0]!.type).toBe('file_write');
    expect(rules[0]!.description).toBe('Write output');
  });

  it('checks if a request is allowed', () => {
    const store = new PermissionStore(storePath);
    store.addPermission('test1', '/tmp/**', 'file_write');

    expect(
      store.isAllowed({ type: 'file_write', target: '/tmp/test.txt', safety: 'moderate' }),
    ).toBe(true);

    expect(
      store.isAllowed({ type: 'file_write', target: '/etc/passwd', safety: 'moderate' }),
    ).toBe(false);
  });

  it('removes a specific permission', () => {
    const store = new PermissionStore(storePath);
    store.addPermission('a', '/tmp/a.txt', 'file_write', 'File A');
    store.addPermission('b', '/tmp/b.txt', 'file_write', 'File B');

    store.removePermission('a');
    const rules = store.listPermissions();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.key).toBe('b');
  });

  it('handles empty store', () => {
    const store = new PermissionStore(storePath);
    expect(store.listPermissions()).toEqual([]);
    expect(
      store.isAllowed({ type: 'file_write', target: '/test', safety: 'moderate' }),
    ).toBe(false);
  });

  it('makes wildcard keys correctly', () => {
    const store = new PermissionStore(storePath);
    const key = store.makeWildcardKey('npm install express');
    expect(key).toBe('command:npm *');
  });

  it('clears all permissions', () => {
    const store = new PermissionStore(storePath);
    store.addPermission('a', '/tmp/*', 'file_write');
    store.addPermission('b', '/tmp/*', 'file_read');

    store.clear();
    expect(store.listPermissions()).toEqual([]);
  });

  it('matches globstar patterns', () => {
    const store = new PermissionStore(storePath);
    store.addPermission('glob', '/project/**/*.ts', 'file_read');

    expect(
      store.isAllowed({ type: 'file_read', target: '/project/src/index.ts', safety: 'safe' }),
    ).toBe(true);

    expect(
      store.isAllowed({
        type: 'file_read',
        target: '/project/src/deep/nested/file.ts',
        safety: 'safe',
      }),
    ).toBe(true);

    expect(
      store.isAllowed({ type: 'file_read', target: '/other/file.ts', safety: 'safe' }),
    ).toBe(false);
  });
});

describe('PermissionManager integration', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    storePath = path.join(tmpDir, 'permissions.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-approves safe requests', async () => {
    const manager = new PermissionManager({
      storePath,
      autoApprove: false,
      onPrompt: async () => { throw new Error('should not prompt'); },
    });

    const result = await manager.check({
      type: 'file_read',
      target: '/test/readme.md',
      safety: 'safe',
    });
    expect(result.action).toBe('allow');
  });

  it('prompts for moderate requests', async () => {
    let prompted = false;
    const manager = new PermissionManager({
      storePath,
      autoApprove: false,
      onPrompt: async () => {
        prompted = true;
        return { action: 'deny' };
      },
    });

    const result = await manager.check({
      type: 'file_write',
      target: '/test/output.txt',
      safety: 'moderate',
    });

    expect(prompted).toBe(true);
    expect(result.action).toBe('deny');
  });

  it('auto-approves moderate when configured', async () => {
    const manager = new PermissionManager({
      storePath,
      autoApprove: true,
    });

    const result = await manager.check({
      type: 'file_write',
      target: '/test/output.txt',
      safety: 'moderate',
    });
    expect(result.action).toBe('allow');
  });

  it('blocks blocked-level requests', async () => {
    const manager = new PermissionManager({
      storePath,
      autoApprove: true,
    });

    const result = await manager.check({
      type: 'shell_exec',
      target: 'sudo rm -rf /',
      safety: 'blocked',
    });
    expect(result.action).toBe('deny');
  });

  it('denies moderate requests without approval', async () => {
    const manager = new PermissionManager({
      storePath,
      autoApprove: false,
    });

    const result = await manager.check({
      type: 'file_write',
      target: '/test/file.txt',
      safety: 'moderate',
    });
    expect(result.action).toBe('deny');
  });

  it('remembers session approvals', async () => {
    const manager = new PermissionManager({
      storePath,
      autoApprove: false,
      onPrompt: async () => ({ action: 'allow' }),
    });

    const req = {
      type: 'shell_exec' as const,
      target: 'npm install',
      safety: 'moderate' as const,
    };

    const result1 = await manager.check(req);
    expect(result1.action).toBe('allow');

    const result2 = await manager.check(req);
    expect(result2.action).toBe('allow');
    // No onPrompt called for 2nd check
  });

  it('persists allow-always rules to store', async () => {
    const manager = new PermissionManager({ storePath });
    manager.allowAlways({
      type: 'file_write',
      target: '/project/**',
      safety: 'moderate',
      description: 'Project files',
    });

    const store = new PermissionStore(storePath);
    expect(store.listPermissions()).toHaveLength(1);
  });

  it('checks isAlwaysAllowed', () => {
    const manager = new PermissionManager({ storePath });
    manager.allowAlways({
      type: 'file_write',
      target: '/project/**',
      safety: 'moderate',
    });

    expect(
      manager.isAlwaysAllowed({
        type: 'file_write',
        target: '/project/src/main.ts',
        safety: 'moderate',
      }),
    ).toBe(true);

    expect(
      manager.isAlwaysAllowed({
        type: 'file_write',
        target: '/other/secret.txt',
        safety: 'moderate',
      }),
    ).toBe(false);
  });

  it('resets session approvals', async () => {
    const manager = new PermissionManager({ storePath });

    manager.allowSession({
      type: 'shell_exec',
      target: 'node script.js',
      safety: 'moderate',
    });

    expect(
      manager.isAlwaysAllowed({
        type: 'shell_exec',
        target: 'node script.js',
        safety: 'moderate',
      }),
    ).toBe(false); // Not persistent

    // But check should still allow it
    let result = await manager.check({
      type: 'shell_exec',
      target: 'node script.js',
      safety: 'moderate',
    });
    expect(result.action).toBe('allow');

    manager.resetSession();

    result = await manager.check({
      type: 'shell_exec',
      target: 'node script.js',
      safety: 'moderate',
    });
    expect(result.action).toBe('deny');
  });
});
