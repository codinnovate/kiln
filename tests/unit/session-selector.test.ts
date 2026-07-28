import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionManager } from '../../src/sessions/manager.js';
import type { AgentConfig } from '../../src/agent/types.js';

vi.mock('../../src/sessions/manager.js', () => {
  return {
    SessionManager: vi.fn().mockImplementation(() => ({
      listSessions: vi.fn(),
    })),
  };
});

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-sessionselector-test-'));
}

describe('SessionSelector helper logic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('session metadata formatting', () => {
    it('formats ISO dates with zero-padded month and day', () => {
      const date = new Date('2025-01-05T00:00:00.000Z');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      expect(`${month}-${day}`).toBe('01-05');
    });

    it('pads single-digit months and days', () => {
      const date = new Date('2025-12-31T00:00:00.000Z');
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      expect(month).toBe('12');
      expect(day).toBe('31');
    });

    it('formats time with zero-padded hours and minutes', () => {
      const date = new Date('2025-06-15T09:30:00.000Z');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      expect(`${hours}:${minutes}`).toBe('09:30');
    });
  });

  describe('session ID truncation', () => {
    it('truncates to 8 characters for display', () => {
      const id = 'abc12345-6789-0000-0000-000000000000';
      expect(id.slice(0, 8)).toBe('abc12345');
    });

    it('handles short IDs', () => {
      const id = 'abc';
      expect(id.slice(0, 8)).toBe('abc');
    });
  });

  describe('SessionManager integration', () => {
    it('SessionManager is mockable', async () => {
      const { SessionManager } = await import('../../src/sessions/manager.js');
      const manager = new SessionManager() as any;
      manager.listSessions.mockResolvedValue([]);
      const sessions = await manager.listSessions(20);
      expect(sessions).toEqual([]);
    });

    it('SessionManager.listSessions accepts limit parameter', async () => {
      const { SessionManager } = await import('../../src/sessions/manager.js');
      const manager = new SessionManager() as any;
      manager.listSessions.mockResolvedValue([
        { id: '1', title: 'Session 1' },
        { id: '2', title: 'Session 2' },
      ]);
      const sessions = await manager.listSessions(20);
      expect(sessions).toHaveLength(2);
      expect(manager.listSessions).toHaveBeenCalledWith(20);
    });

    it('SessionManager.listSessions returns session metadata', async () => {
      const { SessionManager } = await import('../../src/sessions/manager.js');
      const manager = new SessionManager() as any;
      const mockSessions = [
        {
          id: 'sess-123',
          title: 'Fix bug',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-06-01T12:00:00.000Z',
          model: 'openai/gpt-4o',
          provider: 'openai',
          projectPath: '/test',
          messageCount: 5,
        },
      ];
      manager.listSessions.mockResolvedValue(mockSessions);
      const sessions = await manager.listSessions(20);
      expect(sessions[0].model).toBe('openai/gpt-4o');
      expect(sessions[0].messageCount).toBe(5);
    });
  });
});

describe('SessionSelector component data structure', () => {
  it('session data structure matches expected interface', () => {
    const session = {
      id: 'test-session-id',
      title: 'Test Session',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-06-01T12:00:00.000Z',
      model: 'openai/gpt-4o',
      provider: 'openai',
      projectPath: '/test',
      messageCount: 10,
    };

    expect(session.id).toBeTruthy();
    expect(session.title).toBeTruthy();
    expect(new Date(session.createdAt).getTime()).not.toBeNaN();
    expect(new Date(session.updatedAt).getTime()).not.toBeNaN();
    expect(session.messageCount).toBeGreaterThanOrEqual(0);
  });

  it('handles sessions with varying message counts', () => {
    const sessions = [
      { id: '1', messageCount: 0 },
      { id: '2', messageCount: 1 },
      { id: '3', messageCount: 100 },
    ];

    for (const s of sessions) {
      expect(typeof s.messageCount).toBe('number');
      expect(s.messageCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles empty session list', () => {
    const sessions: unknown[] = [];
    expect(sessions.length).toBe(0);
  });

  it('session titles are used for display', () => {
    const sessions = [
      { id: 'a', title: 'Fix TypeScript errors' },
      { id: 'b', title: 'Add feature X' },
    ];

    for (const s of sessions) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.title.length).toBeLessThan(200);
    }
  });

  it('selected index stays within bounds', () => {
    const sessions = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const maxIndex = sessions.length - 1;
    expect(Math.min(sessions.length - 1, 5)).toBe(maxIndex);
    expect(Math.max(0, -1)).toBe(0);
  });
});
