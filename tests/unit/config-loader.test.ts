import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-configloader-test-'));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('config/loader', () => {
  let tmpDir: string;
  let mockHome: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    mockHome = path.join(tmpDir, 'home');
    fs.mkdirSync(mockHome, { recursive: true });
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  describe('loadGlobalConfig', () => {
    it('returns defaults when config.json does not exist', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadGlobalConfig } = await import('../../src/config/loader.js');
      const config = loadGlobalConfig();
      expect(config.theme).toBe('auto');
      expect(config.debug).toBe(false);
      expect(config.providers).toEqual({});
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });

    it('parses valid config.json', async () => {
      const kilnDir = path.join(mockHome, '.kiln');
      fs.mkdirSync(kilnDir, { recursive: true });
      fs.writeFileSync(
        path.join(kilnDir, 'config.json'),
        JSON.stringify({ theme: 'dark', debug: true }),
      );

      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadGlobalConfig } = await import('../../src/config/loader.js');
      const config = loadGlobalConfig();
      expect(config.theme).toBe('dark');
      expect(config.debug).toBe(true);
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });

    it('returns defaults for invalid JSON', async () => {
      const kilnDir = path.join(mockHome, '.kiln');
      fs.mkdirSync(kilnDir, { recursive: true });
      fs.writeFileSync(path.join(kilnDir, 'config.json'), 'not-valid-json');

      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadGlobalConfig } = await import('../../src/config/loader.js');
      const config = loadGlobalConfig();
      expect(config.theme).toBe('auto');
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });
  });

  describe('loadCredentials', () => {
    it('returns empty object when no credentials file', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadCredentials } = await import('../../src/config/loader.js');
      const creds = loadCredentials();
      expect(creds).toEqual({});
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });

    it('loads valid credentials', async () => {
      const kilnDir = path.join(mockHome, '.kiln');
      fs.mkdirSync(kilnDir, { recursive: true });
      fs.writeFileSync(
        path.join(kilnDir, 'credentials.json'),
        JSON.stringify({ openai: 'sk-test', anthropic: 'sk-ant-test' }),
      );

      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadCredentials } = await import('../../src/config/loader.js');
      const creds = loadCredentials();
      expect(creds.openai).toBe('sk-test');
      expect(creds.anthropic).toBe('sk-ant-test');
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });

    it('returns defaults for invalid credentials JSON', async () => {
      const kilnDir = path.join(mockHome, '.kiln');
      fs.mkdirSync(kilnDir, { recursive: true });
      fs.writeFileSync(path.join(kilnDir, 'credentials.json'), '{{invalid');

      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadCredentials } = await import('../../src/config/loader.js');
      const creds = loadCredentials();
      expect(creds).toEqual({});
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });
  });

  describe('getConfigDir', () => {
    it('returns a path ending with .kiln', async () => {
      const { getConfigDir } = await import('../../src/config/loader.js');
      const dir = getConfigDir();
      expect(dir).toContain('.kiln');
    });

    it('returns an absolute path', async () => {
      const { getConfigDir } = await import('../../src/config/loader.js');
      const dir = getConfigDir();
      expect(path.isAbsolute(dir)).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('returns Config object with all three sections', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadConfig } = await import('../../src/config/loader.js');
      const config = loadConfig();
      expect(config).toHaveProperty('global');
      expect(config).toHaveProperty('project');
      expect(config).toHaveProperty('credentials');
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });

    it('global config has default values when no file exists', async () => {
      vi.doMock('node:os', async (importOriginal) => {
        const orig = await importOriginal<typeof import('node:os')>();
        return { ...orig, homedir: () => mockHome };
      });
      vi.doMock('dotenv', () => ({ config: vi.fn() }));

      const { loadConfig } = await import('../../src/config/loader.js');
      const config = loadConfig();
      expect(config.global.theme).toBe('auto');
      expect(config.global.debug).toBe(false);
      vi.doUnmock('node:os');
      vi.doUnmock('dotenv');
    });
  });
});
