import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-credentials-test-'));
}

describe('config/credentials', () => {
  let tmpDir: string;
  let mockHome: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockHome = path.join(tmpDir, 'home');
    fs.mkdirSync(mockHome, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('setCredential and getCredential', () => {
    it('sets and retrieves a credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { setCredential, getCredential } = await import('../../src/config/credentials.js');
      setCredential('openai', 'sk-test-123');
      const key = getCredential('openai');
      expect(key).toBe('sk-test-123');
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });

    it('returns undefined for nonexistent credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { getCredential } = await import('../../src/config/credentials.js');
      const key = getCredential('nonexistent');
      expect(key).toBeUndefined();
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });

    it('overwrites existing credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { setCredential, getCredential } = await import('../../src/config/credentials.js');
      setCredential('openai', 'old-key');
      setCredential('openai', 'new-key');
      expect(getCredential('openai')).toBe('new-key');
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });
  });

  describe('removeCredential', () => {
    it('removes an existing credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { setCredential, removeCredential, getCredential } = await import('../../src/config/credentials.js');
      setCredential('openai', 'sk-key');
      const removed = removeCredential('openai');
      expect(removed).toBe(true);
      expect(getCredential('openai')).toBeUndefined();
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });

    it('returns false when removing nonexistent credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { removeCredential } = await import('../../src/config/credentials.js');
      const removed = removeCredential('nonexistent');
      expect(removed).toBe(false);
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });
  });

  describe('listCredentials', () => {
    it('lists all set credentials', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { setCredential, listCredentials } = await import('../../src/config/credentials.js');
      setCredential('openai', 'sk-key');
      setCredential('anthropic', 'sk-ant-key');
      const list = listCredentials();
      expect(list).toContain('openai');
      expect(list).toContain('anthropic');
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });

    it('returns empty array when no credentials', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { listCredentials } = await import('../../src/config/credentials.js');
      const list = listCredentials();
      expect(list).toEqual([]);
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });
  });

  describe('hasCredential', () => {
    it('returns true for existing credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { setCredential, hasCredential } = await import('../../src/config/credentials.js');
      setCredential('openai', 'sk-key');
      expect(hasCredential('openai')).toBe(true);
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });

    it('returns false for missing credential', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { hasCredential } = await import('../../src/config/credentials.js');
      expect(hasCredential('nonexistent')).toBe(false);
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });
  });

  describe('credential file persistence', () => {
    it('creates credentials.json file', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('../../src/config/loader.js', async (importOriginal) => {
        const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
        return { ...orig, getConfigDir: () => path.join(mockHome, '.kiln') };
      });

      const { setCredential } = await import('../../src/config/credentials.js');
      setCredential('openai', 'sk-key');
      const credPath = path.join(mockHome, '.kiln', 'credentials.json');
      expect(fs.existsSync(credPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      expect(content.openai).toBe('sk-key');
      vi.doUnmock('node:os');
      vi.doUnmock('../../src/config/loader.js');
    });
  });
});
