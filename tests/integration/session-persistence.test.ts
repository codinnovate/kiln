import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionStore } from '../../src/sessions/store.js';
import { SessionManager } from '../../src/sessions/manager.js';
import type { Session } from '../../src/sessions/types.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-session-int-'));
}

function makeSession(
  id: string,
  messages: { role: string; content: string }[],
  overrides?: Partial<Session>,
): Session {
  return {
    metadata: {
      id,
      title: `Test ${id}`,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      model: 'openai/gpt-4o',
      provider: 'openai',
      projectPath: '/test',
      messageCount: messages.length,
      ...overrides?.metadata,
    },
    messages: messages as Session['messages'],
    state: overrides?.state ?? {
      totalTokens: { input: 50, output: 25 },
      iterations: 2,
    },
  };
}

describe('SessionStore integration', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tmpDir = createTempDir();
    store = new SessionStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists and retrieves a session', async () => {
    const session = makeSession('test-1', [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
    await store.save(session);

    const loaded = await store.load('test-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.metadata.id).toBe('test-1');
    expect(loaded!.metadata.title).toBe('Test test-1');
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.messages[0]).toEqual({ role: 'user', content: 'hello' });
    expect(loaded!.messages[1]).toEqual({ role: 'assistant', content: 'hi there' });
    expect(loaded!.state.totalTokens.input).toBe(50);
    expect(loaded!.state.totalTokens.output).toBe(25);
    expect(loaded!.state.iterations).toBe(2);
  });

  it('returns null for nonexistent session', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('lists sessions sorted by updatedAt descending', async () => {
    await store.save(
      makeSession('older', [{ role: 'user', content: 'a' }], {
        metadata: { updatedAt: '2024-01-01T00:00:00.000Z' } as any,
      } as any),
    );
    await store.save(
      makeSession('newer', [{ role: 'user', content: 'b' }], {
        metadata: { updatedAt: '2025-01-01T00:00:00.000Z' } as any,
      } as any),
    );

    const sessions = await store.list();
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.id).toBe('newer');
    expect(sessions[1]!.id).toBe('older');
  });

  it('deletes a session', async () => {
    const session = makeSession('to-delete', [{ role: 'user', content: 'x' }]);
    await store.save(session);

    await store.delete('to-delete');
    const loaded = await store.load('to-delete');
    expect(loaded).toBeNull();
  });

  it('checks existence', async () => {
    const session = makeSession('exists-yes', [{ role: 'user', content: 'x' }]);
    await store.save(session);

    expect(await store.exists('exists-yes')).toBe(true);
    expect(await store.exists('exists-no')).toBe(false);
  });

  it('generates unique IDs', () => {
    const id1 = store.generateId();
    const id2 = store.generateId();
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
  });

  it('updates an existing session', async () => {
    const session = makeSession('update-me', [{ role: 'user', content: 'v1' }]);
    await store.save(session);

    session.messages.push({ role: 'assistant', content: 'v2' } as Session['messages'][0]);
    session.metadata.messageCount = 2;
    await store.save(session);

    const loaded = await store.load('update-me');
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.messages[1]).toEqual({ role: 'assistant', content: 'v2' });
  });

  it('handles sessions with long content', async () => {
    const longContent = 'x'.repeat(10_000);
    const session = makeSession('long', [
      { role: 'user', content: longContent },
    ]);
    await store.save(session);

    const loaded = await store.load('long');
    expect(loaded!.messages[0].content).toBe(longContent);
  });
});

describe('SessionManager integration', () => {
  let tmpDir: string;
  let store: SessionStore;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = createTempDir();
    store = new SessionStore(tmpDir);
    manager = new SessionManager(store);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates and resumes a session lifecycle', async () => {
    const session = await manager.startNewSession({
      model: 'openai/gpt-4o',
      provider: 'openai',
      cwd: '/test',
      maxIterations: 20,
    });

    expect(session.metadata.id).toBeTruthy();
    expect(session.metadata.title).toBe('New Session');
    expect(session.messages).toEqual([]);

    session.messages.push(
      { role: 'user', content: 'hello' } as any,
      { role: 'assistant', content: 'world' } as any,
    );
    await manager.saveSession(session);

    const resumed = await manager.resumeSession(session.metadata.id);
    expect(resumed.metadata.id).toBe(session.metadata.id);
    expect(resumed.messages).toHaveLength(2);
  });

  it('generates a title from first prompt', () => {
    const title = manager.generateTitle('Hello, how do I write a TypeScript function?');
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(100);
  });

  it('lists sessions with limit', async () => {
    for (let i = 0; i < 5; i++) {
      const session = await manager.startNewSession({
        model: 'openai/gpt-4o', provider: 'openai', cwd: '/test', maxIterations: 20,
      });
      session.metadata.title = `Session ${i}`;
      await manager.saveSession(session);
    }

    const all = await manager.listSessions();
    expect(all).toHaveLength(5);

    const limited = await manager.listSessions(3);
    expect(limited).toHaveLength(3);
  });

  it('lists sessions in reverse chronological order', async () => {
    const s1 = await manager.startNewSession({
      model: 'openai/gpt-4o', provider: 'openai', cwd: '/test', maxIterations: 20,
    });
    s1.metadata.title = 'First';
    await manager.saveSession(s1);
    // override updatedAt on disk
    const store = new SessionStore(tmpDir);
    const storedS1 = await store.load(s1.metadata.id);
    storedS1!.metadata.updatedAt = new Date(0).toISOString();
    await store.save(storedS1!);

    const s2 = await manager.startNewSession({
      model: 'openai/gpt-4o', provider: 'openai', cwd: '/test', maxIterations: 20,
    });
    s2.metadata.title = 'Second';
    await manager.saveSession(s2);
    const storedS2 = await store.load(s2.metadata.id);
    storedS2!.metadata.updatedAt = new Date(1000).toISOString();
    await store.save(storedS2!);

    const sessions = await manager.listSessions();
    expect(sessions[0]!.title).toBe('Second');
    expect(sessions[1]!.title).toBe('First');
  });

  it('searches sessions by title', async () => {
    const s1 = await manager.startNewSession({
      model: 'openai/gpt-4o', provider: 'openai', cwd: '/test', maxIterations: 20,
    });
    s1.metadata.title = 'Express API';
    await manager.saveSession(s1);

    const s2 = await manager.startNewSession({
      model: 'openai/gpt-4o', provider: 'openai', cwd: '/test', maxIterations: 20,
    });
    s2.metadata.title = 'React Component';
    await manager.saveSession(s2);

    const results = await manager.searchSessions('Express');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Express API');
  });

  it('deletes a session', async () => {
    const session = await manager.startNewSession({
      model: 'openai/gpt-4o', provider: 'openai', cwd: '/test', maxIterations: 20,
    });
    const id = session.metadata.id;

    await manager.deleteSession(id);

    await expect(
      manager.resumeSession(id),
    ).rejects.toThrow('Session not found');
  });

  it('generates title with truncation for long messages', () => {
    const short = 'Short message';
    expect(manager.generateTitle(short)).toBe('Short message');

    const long = 'x'.repeat(100);
    const title = manager.generateTitle(long);
    expect(title.length).toBe(60);
    expect(title.endsWith('...')).toBe(true);
  });
});
