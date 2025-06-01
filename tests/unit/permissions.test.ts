import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PermissionStore } from '../../src/permissions/store.js';
import { PermissionManager } from '../../src/permissions/manager.js';
import type { PermissionRequest } from '../../src/permissions/types.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-perms-test-'));
}

describe('PermissionStore', () => {
  let tmpDir: string;
  let storePath: string;
  let store: PermissionStore;

  beforeEach(() => {
    tmpDir = createTempDir();
    storePath = path.join(tmpDir, 'permissions.json');
    store = new PermissionStore(storePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('add and check', () => {
    it('adds a permission and checks it', () => {
      store.addPermission('cmd:ls *', 'ls *', 'command', 'Allow ls');
      expect(store.hasPermission('cmd:ls *')).toBe(true);
    });

    it('isAllowed matches by pattern', () => {
      store.addPermission('cmd:git *', 'git *', 'command', 'Allow git');
      const request: PermissionRequest = {
        type: 'command',
        target: 'git status',
        description: 'Check status',
        safety: 'safe',
      };
      expect(store.isAllowed(request)).toBe(true);
    });

    it('isAllowed rejects non-matching pattern', () => {
      store.addPermission('cmd:git *', 'git *', 'command', 'Allow git');
      const request: PermissionRequest = {
        type: 'command',
        target: 'rm -rf /',
        description: 'Delete',
        safety: 'blocked',
      };
      expect(store.isAllowed(request)).toBe(false);
    });

    it('isAllowed only matches same type', () => {
      store.addPermission('cmd:git *', 'git *', 'command', 'Allow git');
      const request: PermissionRequest = {
        type: 'file_write',
        target: 'git *',
        description: 'File',
        safety: 'moderate',
      };
      expect(store.isAllowed(request)).toBe(false);
    });
  });

  describe('wildcard patterns', () => {
    it('matches wildcard * in middle of path', () => {
      store.addPermission('file:/src/*', '/src/*', 'file_write', 'Allow src writes');
      const request: PermissionRequest = {
        type: 'file_write',
        target: '/src/index.ts',
        description: '',
        safety: 'moderate',
      };
      expect(store.isAllowed(request)).toBe(true);
    });

    it('matches double wildcard ** for nested paths', () => {
      store.addPermission('file:/src/**', '/src/**', 'file_write', 'Allow nested');
      const request: PermissionRequest = {
        type: 'file_write',
        target: '/src/deep/nested/file.ts',
        description: '',
        safety: 'moderate',
      };
      expect(store.isAllowed(request)).toBe(true);
    });

    it('does not match partial pattern', () => {
      store.addPermission('cmd:npm *', 'npm *', 'command', 'Allow npm');
      const request: PermissionRequest = {
        type: 'command',
        target: 'npmx something',
        description: '',
        safety: 'moderate',
      };
      expect(store.isAllowed(request)).toBe(false);
    });
  });

  describe('remove', () => {
    it('removes an existing permission', () => {
      store.addPermission('key1', 'pattern1', 'command');
      expect(store.removePermission('key1')).toBe(true);
      expect(store.hasPermission('key1')).toBe(false);
    });

    it('returns false when removing nonexistent permission', () => {
      expect(store.removePermission('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('lists all permissions', () => {
      store.addPermission('k1', 'p1', 'command');
      store.addPermission('k2', 'p2', 'file_write');
      const list = store.listPermissions();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.key)).toContain('k1');
      expect(list.map((p) => p.key)).toContain('k2');
    });

    it('returns empty list for new store', () => {
      expect(store.listPermissions()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all permissions', () => {
      store.addPermission('k1', 'p1', 'command');
      store.addPermission('k2', 'p2', 'file_write');
      store.clear();
      expect(store.listPermissions()).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('loads permissions from file on construction', () => {
      store.addPermission('saved', 'test *', 'command');
      const store2 = new PermissionStore(storePath);
      expect(store2.hasPermission('saved')).toBe(true);
    });

    it('handles missing store file gracefully', () => {
      const newStore = new PermissionStore(path.join(tmpDir, 'nope.json'));
      expect(newStore.listPermissions()).toEqual([]);
    });
  });

  describe('makeKey', () => {
    it('creates key from request', () => {
      const request: PermissionRequest = {
        type: 'command',
        target: 'git push',
        description: '',
        safety: 'moderate',
      };
      expect(store.makeKey(request)).toBe('command:git push');
    });
  });

  describe('makeWildcardKey', () => {
    it('creates wildcard key from command', () => {
      expect(store.makeWildcardKey('git status')).toBe('command:git *');
      expect(store.makeWildcardKey('npm install foo')).toBe('command:npm *');
    });
  });
});

describe('PermissionManager', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    storePath = path.join(tmpDir, 'permissions.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows safe commands automatically', async () => {
    const manager = new PermissionManager({ storePath });
    const decision = await manager.check({
      type: 'command',
      target: 'git status',
      description: 'Check status',
      safety: 'safe',
    });
    expect(decision.action).toBe('allow');
  });

  it('denies blocked commands', async () => {
    const manager = new PermissionManager({ storePath });
    const decision = await manager.check({
      type: 'command',
      target: 'rm -rf /',
      description: 'Delete root',
      safety: 'blocked',
    });
    expect(decision.action).toBe('deny');
  });

  it('denies moderate commands without prompt or autoApprove', async () => {
    const manager = new PermissionManager({ storePath });
    const decision = await manager.check({
      type: 'command',
      target: 'npm install',
      description: 'Install packages',
      safety: 'moderate',
    });
    expect(decision.action).toBe('deny');
  });

  it('allows moderate commands with autoApprove', async () => {
    const manager = new PermissionManager({ storePath, autoApprove: true });
    const decision = await manager.check({
      type: 'command',
      target: 'npm install',
      description: 'Install packages',
      safety: 'moderate',
    });
    expect(decision.action).toBe('allow');
  });

  it('prompts user for moderate commands', async () => {
    const manager = new PermissionManager({
      storePath,
      onPrompt: async () => ({ action: 'allow' }),
    });
    const decision = await manager.check({
      type: 'command',
      target: 'git push',
      description: 'Push changes',
      safety: 'moderate',
    });
    expect(decision.action).toBe('allow');
  });

  it('denies when prompt returns deny', async () => {
    const manager = new PermissionManager({
      storePath,
      onPrompt: async () => ({ action: 'deny' }),
    });
    const decision = await manager.check({
      type: 'command',
      target: 'git push',
      description: 'Push',
      safety: 'moderate',
    });
    expect(decision.action).toBe('deny');
  });

  it('allowAlways persists permission', async () => {
    const manager = new PermissionManager({ storePath });
    const request: PermissionRequest = {
      type: 'command',
      target: 'npm test',
      description: 'Run tests',
      safety: 'moderate',
    };
    await manager.allowAlways(request);
    const decision = await manager.check(request);
    expect(decision.action).toBe('allow');
  });

  it('session allowed works within session', async () => {
    const manager = new PermissionManager({ storePath });
    const request: PermissionRequest = {
      type: 'command',
      target: 'git push origin main',
      description: 'Push',
      safety: 'moderate',
    };
    manager.allowSession(request);
    const decision = await manager.check(request);
    expect(decision.action).toBe('allow');
  });

  it('resetSession clears session permissions', async () => {
    const manager = new PermissionManager({ storePath });
    const request: PermissionRequest = {
      type: 'command',
      target: 'git push',
      description: 'Push',
      safety: 'moderate',
    };
    manager.allowSession(request);
    manager.resetSession();
    const decision = await manager.check(request);
    expect(decision.action).toBe('deny');
  });

  it('denyPermission removes permission', async () => {
    const manager = new PermissionManager({ storePath });
    const request: PermissionRequest = {
      type: 'command',
      target: 'npm test',
      description: 'Test',
      safety: 'moderate',
    };
    await manager.allowAlways(request);
    manager.denyPermission(manager.getStore().makeKey(request));
    const decision = await manager.check(request);
    expect(decision.action).toBe('deny');
  });

  it('allowWildcard allows all commands of that type', async () => {
    const manager = new PermissionManager({ storePath });
    manager.allowWildcard('git status');
    const decision = await manager.check({
      type: 'command',
      target: 'git push origin main',
      description: 'Push',
      safety: 'moderate',
    });
    expect(decision.action).toBe('allow');
  });

  it('implements PermissionChecker interface', async () => {
    const manager = new PermissionManager({ storePath });
    const result = await manager.check({
      type: 'command',
      target: 'ls',
      description: '',
      safety: 'safe',
    });
    expect(result).toHaveProperty('action');
    expect(manager.isAlwaysAllowed({
      type: 'command',
      target: 'anything',
      description: '',
      safety: 'safe',
    })).toBe(false);
  });
});

describe('PermissionStore edge cases', () => {
  let tmpDir: string;
  let storePath: string;
  let store: PermissionStore;

  beforeEach(() => {
    tmpDir = createTempDir();
    storePath = path.join(tmpDir, 'permissions.json');
    store = new PermissionStore(storePath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles special regex characters in patterns', () => {
    store.addPermission('file:/path/to/[test]', '/path/to/[test]', 'file_write');
    const request: PermissionRequest = {
      type: 'file_write',
      target: '/path/to/[test]',
      description: '',
      safety: 'moderate',
    };
    expect(store.isAllowed(request)).toBe(true);
  });

  it('handles dot characters literally in patterns', () => {
    store.addPermission('cmd:node script.js', 'node script.js', 'command');
    const request: PermissionRequest = {
      type: 'command',
      target: 'node scriptXjs',
      description: '',
      safety: 'moderate',
    };
    expect(store.isAllowed(request)).toBe(false);
  });

  it('question mark matches single character', () => {
    store.addPermission('file:/src/file?.ts', '/src/file?.ts', 'file_write');
    const matchRequest: PermissionRequest = {
      type: 'file_write',
      target: '/src/file1.ts',
      description: '',
      safety: 'moderate',
    };
    const noMatchRequest: PermissionRequest = {
      type: 'file_write',
      target: '/src/file12.ts',
      description: '',
      safety: 'moderate',
    };
    expect(store.isAllowed(matchRequest)).toBe(true);
    expect(store.isAllowed(noMatchRequest)).toBe(false);
  });

  it('listPermissions includes addedAt timestamp', () => {
    store.addPermission('k1', 'test *', 'command');
    const list = store.listPermissions();
    expect(list).toHaveLength(1);
    expect(list[0].addedAt).toBeTruthy();
    expect(new Date(list[0].addedAt).getTime()).not.toBeNaN();
  });

  it('listPermissions includes description when provided', () => {
    store.addPermission('k1', 'test *', 'command', 'Run tests');
    const list = store.listPermissions();
    expect(list[0].description).toBe('Run tests');
  });

  it('listPermissions omits description when not provided', () => {
    store.addPermission('k1', 'test *', 'command');
    const list = store.listPermissions();
    expect(list[0].description).toBeUndefined();
  });

  it('removePermission does not affect other permissions', () => {
    store.addPermission('k1', 'a *', 'command');
    store.addPermission('k2', 'b *', 'command');
    store.removePermission('k1');
    expect(store.hasPermission('k2')).toBe(true);
    expect(store.listPermissions()).toHaveLength(1);
  });

  it('clear resets but store can be reused', () => {
    store.addPermission('k1', 'p1', 'command');
    store.clear();
    store.addPermission('k2', 'p2', 'command');
    expect(store.listPermissions()).toHaveLength(1);
    expect(store.hasPermission('k2')).toBe(true);
    expect(store.hasPermission('k1')).toBe(false);
  });

  it('overwrites existing permission with same key', () => {
    store.addPermission('k1', 'old pattern', 'command', 'old desc');
    store.addPermission('k1', 'new pattern', 'file_write', 'new desc');
    const list = store.listPermissions();
    expect(list).toHaveLength(1);
    expect(list[0].pattern).toBe('new pattern');
    expect(list[0].type).toBe('file_write');
    expect(list[0].description).toBe('new desc');
  });
});

describe('PermissionManager edge cases', () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    storePath = path.join(tmpDir, 'permissions.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prompt callback receives the request', async () => {
    const onPrompt = vi.fn(async () => ({ action: 'deny' as const }));
    const manager = new PermissionManager({ storePath, onPrompt });
    await manager.check({
      type: 'command',
      target: 'npm install',
      description: 'Install',
      safety: 'moderate',
    });
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(onPrompt.mock.calls[0][0].target).toBe('npm install');
    expect(onPrompt.mock.calls[0][0].type).toBe('command');
  });

  it('allow_always decision from prompt persists', async () => {
    const onPrompt = vi.fn(async () => ({ action: 'allow_always' as const }));
    const manager = new PermissionManager({ storePath, onPrompt });
    const request: PermissionRequest = {
      type: 'command',
      target: 'npm test',
      description: 'Test',
      safety: 'moderate',
    };
    await manager.check(request);
    // Second check should allow without prompting
    const decision = await manager.check(request);
    expect(decision.action).toBe('allow');
    expect(onPrompt).toHaveBeenCalledTimes(1);
  });

  it('session permissions do not persist after resetSession', async () => {
    const manager = new PermissionManager({ storePath });
    const request: PermissionRequest = {
      type: 'command',
      target: 'git commit',
      description: '',
      safety: 'moderate',
    };
    manager.allowSession(request);
    expect(await manager.check(request)).toHaveProperty('action', 'allow');
    manager.resetSession();
    expect(await manager.check(request)).toHaveProperty('action', 'deny');
  });

  it('getStore returns the underlying store', () => {
    const manager = new PermissionManager({ storePath });
    const store = manager.getStore();
    expect(store).toBeInstanceOf(PermissionStore);
    store.addPermission('test', 'test *', 'command');
    expect(manager.getStore().hasPermission('test')).toBe(true);
  });

  it('does not prompt for safe commands', async () => {
    const onPrompt = vi.fn();
    const manager = new PermissionManager({ storePath, onPrompt });
    await manager.check({
      type: 'command',
      target: 'ls -la',
      description: '',
      safety: 'safe',
    });
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('does not prompt for blocked commands', async () => {
    const onPrompt = vi.fn();
    const manager = new PermissionManager({ storePath, onPrompt });
    await manager.check({
      type: 'command',
      target: 'rm -rf /',
      description: '',
      safety: 'blocked',
    });
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('autoApprove does not prompt', async () => {
    const onPrompt = vi.fn();
    const manager = new PermissionManager({ storePath, autoApprove: true, onPrompt });
    await manager.check({
      type: 'command',
      target: 'npm install',
      description: '',
      safety: 'moderate',
    });
    expect(onPrompt).not.toHaveBeenCalled();
  });

  it('denyPermission removes from session and store', async () => {
    const manager = new PermissionManager({ storePath });
    const request: PermissionRequest = {
      type: 'command',
      target: 'npm test',
      description: '',
      safety: 'moderate',
    };
    await manager.allowAlways(request);
    expect(await manager.check(request)).toHaveProperty('action', 'allow');
    manager.denyPermission('command:npm test');
    expect(await manager.check(request)).toHaveProperty('action', 'deny');
  });
});
