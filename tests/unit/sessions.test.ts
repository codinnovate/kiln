import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionStore } from '../../src/sessions/store.js';
import { SessionManager } from '../../src/sessions/manager.js';
import type { Session, SessionMetadata } from '../../src/sessions/types.js';
import type { AgentConfig } from '../../src/agent/types.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-sessions-test-'));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeSession(id: string, overrides?: Partial<Session>): Session {
  return {
    metadata: {
      id,
      title: `Session ${id}`,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      model: 'openai/gpt-4o',
      provider: 'openai',
      projectPath: '/test',
      messageCount: 0,
      ...overrides?.metadata,
    },
    messages: overrides?.messages ?? [],
    state: overrides?.state ?? {
      totalTokens: { input: 0, output: 0 },
      iterations: 0,
    },
  };
}

describe('SessionStore', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(async () => {
    tmpDir = createTempDir();
    store = new SessionStore(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  describe('save and load', () => {
    it('saves and loads a session', async () => {
      const session = makeSession('test-1');
      await store.save(session);
      const loaded = await store.load('test-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.metadata.id).toBe('test-1');
      expect(loaded!.metadata.title).toBe('Session test-1');
      expect(loaded!.messages).toEqual([]);
    });

    it('returns null for nonexistent session', async () => {
      const loaded = await store.load('nonexistent');
      expect(loaded).toBeNull();
    });

    it('preserves messages in session', async () => {
      const session = makeSession('with-msgs', {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
      });
      await store.save(session);
      const loaded = await store.load('with-msgs');
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0].role).toBe('user');
      expect(loaded!.messages[1].content).toBe('Hi!');
    });

    it('overwrites existing session on save', async () => {
      const s1 = makeSession('overwrite', { metadata: { title: 'V1' } as SessionMetadata });
      const s2 = makeSession('overwrite', { metadata: { title: 'V2' } as SessionMetadata });
      await store.save(s1);
      await store.save(s2);
      const loaded = await store.load('overwrite');
      expect(loaded!.metadata.title).toBe('V2');
    });
  });

  describe('list', () => {
    it('lists all sessions sorted by updatedAt descending', async () => {
      const s1 = makeSession('old', {
        metadata: { updatedAt: '2025-01-01T00:00:00.000Z' } as SessionMetadata,
      });
      const s2 = makeSession('new', {
        metadata: { updatedAt: '2025-06-01T00:00:00.000Z' } as SessionMetadata,
      });
      await store.save(s1);
      await store.save(s2);
      const list = await store.list();
      expect(list).toHaveLength(2);
      expect(list[0].id).toBe('new');
      expect(list[1].id).toBe('old');
    });

    it('returns empty array for empty directory', async () => {
      const list = await store.list();
      expect(list).toEqual([]);
    });

    it('skips corrupt session files', async () => {
      const goodSession = makeSession('good');
      await store.save(goodSession);
      // Write a corrupt file
      fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not-json', 'utf-8');
      const list = await store.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('good');
    });
  });

  describe('delete', () => {
    it('deletes a session', async () => {
      const session = makeSession('del-me');
      await store.save(session);
      await store.delete('del-me');
      const loaded = await store.load('del-me');
      expect(loaded).toBeNull();
    });

    it('does not throw when deleting nonexistent session', async () => {
      await expect(store.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('returns true for existing session', async () => {
      await store.save(makeSession('exists'));
      expect(await store.exists('exists')).toBe(true);
    });

    it('returns false for nonexistent session', async () => {
      expect(await store.exists('nope')).toBe(false);
    });
  });

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = store.generateId();
      const id2 = store.generateId();
      expect(id1).not.toBe(id2);
      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
    });
  });

  describe('getFilePath', () => {
    it('returns correct file path', () => {
      const filePath = store.getFilePath('abc-123');
      expect(filePath).toBe(path.join(tmpDir, 'abc-123.json'));
    });
  });
});

describe('SessionManager', () => {
  let tmpDir: string;
  let store: SessionStore;
  let manager: SessionManager;

  const testConfig: AgentConfig = {
    model: 'openai/gpt-4o',
    provider: 'openai',
    cwd: '/test',
    maxIterations: 20,
  };

  beforeEach(async () => {
    tmpDir = createTempDir();
    store = new SessionStore(tmpDir);
    manager = new SessionManager(store);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  describe('startNewSession', () => {
    it('creates a new session', async () => {
      const session = await manager.startNewSession(testConfig);
      expect(session.metadata.id).toBeTruthy();
      expect(session.metadata.title).toBe('New Session');
      expect(session.metadata.model).toBe('openai/gpt-4o');
      expect(session.metadata.provider).toBe('openai');
      expect(session.metadata.projectPath).toBe('/test');
      expect(session.messages).toEqual([]);
    });

    it('session is persisted', async () => {
      const session = await manager.startNewSession(testConfig);
      const loaded = await store.load(session.metadata.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.metadata.id).toBe(session.metadata.id);
    });

    it('sets current session', async () => {
      const session = await manager.startNewSession(testConfig);
      expect(manager.getCurrentSession()).toBe(session);
    });
  });

  describe('resumeSession', () => {
    it('resumes an existing session', async () => {
      const session = await manager.startNewSession(testConfig);
      const manager2 = new SessionManager(store);
      const resumed = await manager2.resumeSession(session.metadata.id);
      expect(resumed.metadata.id).toBe(session.metadata.id);
    });

    it('throws for nonexistent session', async () => {
      await expect(manager.resumeSession('nonexistent')).rejects.toThrow('Session not found');
    });
  });

  describe('listSessions', () => {
    it('lists sessions', async () => {
      await manager.startNewSession(testConfig);
      await manager.startNewSession(testConfig);
      const list = await manager.listSessions();
      expect(list).toHaveLength(2);
    });

    it('respects limit', async () => {
      await manager.startNewSession(testConfig);
      await manager.startNewSession(testConfig);
      await manager.startNewSession(testConfig);
      const list = await manager.listSessions(2);
      expect(list).toHaveLength(2);
    });

    it('returns empty for no sessions', async () => {
      const list = await manager.listSessions();
      expect(list).toEqual([]);
    });
  });

  describe('deleteSession', () => {
    it('deletes a session', async () => {
      const session = await manager.startNewSession(testConfig);
      await manager.deleteSession(session.metadata.id);
      const list = await manager.listSessions();
      expect(list).toHaveLength(0);
    });

    it('clears current session if it is the deleted one', async () => {
      const session = await manager.startNewSession(testConfig);
      await manager.deleteSession(session.metadata.id);
      expect(manager.getCurrentSession()).toBeUndefined();
    });
  });

  describe('saveSession', () => {
    it('updates session metadata on save', async () => {
      const session = await manager.startNewSession(testConfig);
      session.messages.push({ role: 'user', content: 'Hello' });
      await manager.saveSession(session);
      const loaded = await store.load(session.metadata.id);
      expect(loaded!.metadata.messageCount).toBe(1);
      expect(loaded!.messages).toHaveLength(1);
    });
  });

  describe('searchSessions', () => {
    it('searches by title', async () => {
      const s1 = await manager.startNewSession(testConfig);
      s1.metadata.title = 'Fix TypeScript errors';
      await manager.saveSession(s1);
      const s2 = await manager.startNewSession(testConfig);
      s2.metadata.title = 'Add unit tests';
      await manager.saveSession(s2);
      const results = await manager.searchSessions('TypeScript');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(s1.metadata.id);
    });

    it('searches by model', async () => {
      const s1 = await manager.startNewSession(testConfig);
      const results = await manager.searchSessions('gpt-4o');
      expect(results).toHaveLength(1);
    });

    it('returns empty for no matches', async () => {
      await manager.startNewSession(testConfig);
      const results = await manager.searchSessions('nonexistent query');
      expect(results).toEqual([]);
    });
  });

  describe('generateTitle', () => {
    it('returns short messages as-is', () => {
      expect(manager.generateTitle('Fix the bug')).toBe('Fix the bug');
    });

    it('truncates long messages to 60 chars', () => {
      const long = 'a'.repeat(100);
      const title = manager.generateTitle(long);
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('...');
    });

    it('normalizes whitespace', () => {
      expect(manager.generateTitle('  hello   world  ')).toBe('hello world');
    });
  });
});
