import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  CredentialsSchema,
  parseGlobalConfig,
  parseProjectConfig,
  parseCredentials,
} from '../../src/config/schema.js';

describe('GlobalConfigSchema', () => {
  it('parses empty object with defaults', () => {
    const result = GlobalConfigSchema.parse({});
    expect(result.theme).toBe('auto');
    expect(result.debug).toBe(false);
    expect(result.providers).toEqual({});
    expect(result.defaultModel).toBeUndefined();
    expect(result.defaultProvider).toBeUndefined();
  });

  it('parses undefined as defaults', () => {
    const result = GlobalConfigSchema.parse(undefined);
    expect(result.theme).toBe('auto');
    expect(result.debug).toBe(false);
  });

  it('parses valid config with all fields', () => {
    const config = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      providers: {
        openai: {
          type: 'openai',
          apiKey: 'sk-test',
          models: ['gpt-4o'],
          defaultModel: 'gpt-4o',
        },
      },
      theme: 'dark',
      debug: true,
    };
    const result = GlobalConfigSchema.parse(config);
    expect(result.defaultProvider).toBe('openai');
    expect(result.defaultModel).toBe('gpt-4o');
    expect(result.theme).toBe('dark');
    expect(result.debug).toBe(true);
    expect(result.providers.openai.type).toBe('openai');
    expect(result.providers.openai.apiKey).toBe('sk-test');
  });

  it('rejects invalid provider type', () => {
    expect(() =>
      GlobalConfigSchema.parse({ defaultProvider: 'invalid' }),
    ).toThrow();
  });

  it('rejects invalid theme', () => {
    expect(() =>
      GlobalConfigSchema.parse({ theme: 'invalid' }),
    ).toThrow();
  });

  it('rejects non-boolean debug', () => {
    expect(() =>
      GlobalConfigSchema.parse({ debug: 'yes' }),
    ).toThrow();
  });

  it('accepts valid provider config with optional baseUrl', () => {
    const result = GlobalConfigSchema.parse({
      providers: {
        custom: {
          type: 'custom',
          baseUrl: 'http://localhost:11434',
          models: ['llama3'],
        },
      },
    });
    expect(result.providers.custom.baseUrl).toBe('http://localhost:11434');
  });

  it('rejects invalid baseUrl format', () => {
    expect(() =>
      GlobalConfigSchema.parse({
        providers: {
          custom: {
            type: 'custom',
            baseUrl: 'not-a-url',
          },
        },
      }),
    ).toThrow();
  });
});

describe('ProjectConfigSchema', () => {
  it('parses empty object', () => {
    const result = ProjectConfigSchema.parse({});
    expect(result.instructions).toBeUndefined();
    expect(result.allowedCommands).toBeUndefined();
    expect(result.blockedCommands).toBeUndefined();
  });

  it('parses valid project config', () => {
    const config = {
      instructions: 'Follow the existing code style',
      allowedCommands: ['npm test', 'npm run build'],
      blockedCommands: ['rm -rf'],
    };
    const result = ProjectConfigSchema.parse(config);
    expect(result.instructions).toBe('Follow the existing code style');
    expect(result.allowedCommands).toEqual(['npm test', 'npm run build']);
    expect(result.blockedCommands).toEqual(['rm -rf']);
  });

  it('rejects non-string instructions', () => {
    expect(() =>
      ProjectConfigSchema.parse({ instructions: 123 }),
    ).toThrow();
  });

  it('rejects non-array allowedCommands', () => {
    expect(() =>
      ProjectConfigSchema.parse({ allowedCommands: 'npm test' }),
    ).toThrow();
  });
});

describe('CredentialsSchema', () => {
  it('parses empty object', () => {
    const result = CredentialsSchema.parse({});
    expect(result).toEqual({});
  });

  it('parses valid credentials', () => {
    const creds = {
      openai: 'sk-test-key',
      anthropic: 'sk-ant-test',
    };
    const result = CredentialsSchema.parse(creds);
    expect(result.openai).toBe('sk-test-key');
    expect(result.anthropic).toBe('sk-ant-test');
  });

  it('rejects non-string values', () => {
    expect(() =>
      CredentialsSchema.parse({ openai: 123 }),
    ).toThrow();
  });
});

describe('parseGlobalConfig', () => {
  it('returns defaults for empty input', () => {
    const result = parseGlobalConfig({});
    expect(result.theme).toBe('auto');
    expect(result.debug).toBe(false);
  });
});

describe('parseProjectConfig', () => {
  it('returns defaults for empty input', () => {
    const result = parseProjectConfig({});
    expect(result.instructions).toBeUndefined();
  });
});

describe('parseCredentials', () => {
  it('returns empty object for empty input', () => {
    const result = parseCredentials({});
    expect(result).toEqual({});
  });
});

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadConfig returns defaults when no files exist', async () => {
    vi.doMock('../../src/config/loader.js', async (importOriginal) => {
      const orig = await importOriginal<typeof import('../../src/config/loader.js')>();
      return {
        ...orig,
        getConfigDir: () => tmpDir,
      };
    });

    const { loadConfig } = await import('../../src/config/loader.js');
    const config = loadConfig();
    expect(config.global.theme).toBe('auto');
    expect(config.project).toEqual({});
    expect(config.credentials).toEqual({});
    vi.doUnmock('../../src/config/loader.js');
  });
});
