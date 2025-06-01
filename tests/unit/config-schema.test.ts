import { describe, it, expect } from 'vitest';
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  CredentialsSchema,
  parseGlobalConfig,
  parseProjectConfig,
  parseCredentials,
} from '../../src/config/schema.js';

describe('GlobalConfigSchema', () => {
  describe('defaults', () => {
    it('returns defaults for empty object', () => {
      const result = GlobalConfigSchema.parse({});
      expect(result.theme).toBe('auto');
      expect(result.debug).toBe(false);
      expect(result.providers).toEqual({});
      expect(result.defaultModel).toBeUndefined();
      expect(result.defaultProvider).toBeUndefined();
    });

    it('returns defaults for undefined input', () => {
      const result = GlobalConfigSchema.parse(undefined);
      expect(result.theme).toBe('auto');
      expect(result.debug).toBe(false);
      expect(result.providers).toEqual({});
    });
  });

  describe('valid configs', () => {
    it('parses full config with all fields', () => {
      const config = {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o',
        providers: {
          openai: {
            type: 'openai',
            apiKey: 'sk-test',
            models: ['gpt-4o', 'gpt-4o-mini'],
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
      expect(result.providers.openai.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
    });

    it('parses provider with optional baseUrl', () => {
      const config = {
        providers: {
          custom: {
            type: 'custom',
            baseUrl: 'http://localhost:11434',
            models: ['llama3'],
          },
        },
      };
      const result = GlobalConfigSchema.parse(config);
      expect(result.providers.custom.baseUrl).toBe('http://localhost:11434');
    });

    it('parses light theme', () => {
      const result = GlobalConfigSchema.parse({ theme: 'light' });
      expect(result.theme).toBe('light');
    });

    it('accepts all valid provider types', () => {
      const types = ['openai', 'anthropic', 'google', 'openrouter', 'ollama', 'custom'];
      for (const type of types) {
        const result = GlobalConfigSchema.parse({
          providers: { p: { type, models: [] } },
        });
        expect(result.providers.p.type).toBe(type);
      }
    });

    it('parses multiple providers', () => {
      const config = {
        providers: {
          openai: { type: 'openai', models: ['gpt-4o'] },
          anthropic: { type: 'anthropic', models: ['claude-sonnet-4-20250514'] },
          google: { type: 'google', models: ['gemini-2.5-flash'] },
        },
      };
      const result = GlobalConfigSchema.parse(config);
      expect(Object.keys(result.providers)).toHaveLength(3);
    });
  });

  describe('invalid configs', () => {
    it('rejects invalid provider type', () => {
      expect(() =>
        GlobalConfigSchema.parse({ defaultProvider: 'invalid' }),
      ).toThrow();
    });

    it('rejects invalid theme', () => {
      expect(() =>
        GlobalConfigSchema.parse({ theme: 'neon' }),
      ).toThrow();
    });

    it('rejects non-boolean debug', () => {
      expect(() =>
        GlobalConfigSchema.parse({ debug: 'yes' }),
      ).toThrow();
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

    it('rejects non-string defaultModel', () => {
      expect(() =>
        GlobalConfigSchema.parse({ defaultModel: 123 }),
      ).toThrow();
    });
  });
});

describe('ProjectConfigSchema', () => {
  describe('defaults', () => {
    it('parses empty object with all undefined', () => {
      const result = ProjectConfigSchema.parse({});
      expect(result.instructions).toBeUndefined();
      expect(result.allowedCommands).toBeUndefined();
      expect(result.blockedCommands).toBeUndefined();
    });
  });

  describe('valid configs', () => {
    it('parses full project config', () => {
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

    it('parses config with only instructions', () => {
      const result = ProjectConfigSchema.parse({
        instructions: 'Be helpful',
      });
      expect(result.instructions).toBe('Be helpful');
      expect(result.allowedCommands).toBeUndefined();
    });

    it('parses config with only allowedCommands', () => {
      const result = ProjectConfigSchema.parse({
        allowedCommands: ['ls', 'cat'],
      });
      expect(result.allowedCommands).toEqual(['ls', 'cat']);
    });

    it('parses empty arrays', () => {
      const result = ProjectConfigSchema.parse({
        allowedCommands: [],
        blockedCommands: [],
      });
      expect(result.allowedCommands).toEqual([]);
      expect(result.blockedCommands).toEqual([]);
    });
  });

  describe('invalid configs', () => {
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

    it('rejects non-array blockedCommands', () => {
      expect(() =>
        ProjectConfigSchema.parse({ blockedCommands: 42 }),
      ).toThrow();
    });

    it('rejects array with non-string elements', () => {
      expect(() =>
        ProjectConfigSchema.parse({ allowedCommands: [123] }),
      ).toThrow();
    });
  });
});

describe('CredentialsSchema', () => {
  describe('valid inputs', () => {
    it('parses empty object', () => {
      const result = CredentialsSchema.parse({});
      expect(result).toEqual({});
    });

    it('parses valid credentials', () => {
      const creds = {
        openai: 'sk-test-key',
        anthropic: 'sk-ant-test',
        google: 'AIza-test',
      };
      const result = CredentialsSchema.parse(creds);
      expect(result.openai).toBe('sk-test-key');
      expect(result.anthropic).toBe('sk-ant-test');
      expect(result.google).toBe('AIza-test');
    });

    it('parses single credential', () => {
      const result = CredentialsSchema.parse({ openai: 'key123' });
      expect(result.openai).toBe('key123');
    });
  });

  describe('invalid inputs', () => {
    it('rejects non-string values', () => {
      expect(() =>
        CredentialsSchema.parse({ openai: 123 }),
      ).toThrow();
    });

    it('rejects boolean values', () => {
      expect(() =>
        CredentialsSchema.parse({ openai: true }),
      ).toThrow();
    });

    it('rejects null values', () => {
      expect(() =>
        CredentialsSchema.parse({ openai: null }),
      ).toThrow();
    });
  });
});

describe('parseGlobalConfig', () => {
  it('returns defaults for empty input', () => {
    const result = parseGlobalConfig({});
    expect(result.theme).toBe('auto');
    expect(result.debug).toBe(false);
    expect(result.providers).toEqual({});
  });

  it('passes through valid config', () => {
    const config = {
      theme: 'dark',
      debug: true,
      defaultProvider: 'anthropic',
    };
    const result = parseGlobalConfig(config);
    expect(result.theme).toBe('dark');
    expect(result.debug).toBe(true);
    expect(result.defaultProvider).toBe('anthropic');
  });

  it('throws on invalid input', () => {
    expect(() => parseGlobalConfig({ theme: 'invalid' })).toThrow();
  });
});

describe('parseProjectConfig', () => {
  it('returns defaults for empty input', () => {
    const result = parseProjectConfig({});
    expect(result.instructions).toBeUndefined();
  });

  it('passes through valid config', () => {
    const config = { instructions: 'Do things' };
    const result = parseProjectConfig(config);
    expect(result.instructions).toBe('Do things');
  });

  it('throws on invalid input', () => {
    expect(() => parseProjectConfig({ instructions: 123 })).toThrow();
  });
});

describe('parseCredentials', () => {
  it('returns empty object for empty input', () => {
    const result = parseCredentials({});
    expect(result).toEqual({});
  });

  it('passes through valid credentials', () => {
    const result = parseCredentials({ key: 'value' });
    expect(result.key).toBe('value');
  });

  it('throws on invalid input', () => {
    expect(() => parseCredentials({ key: 123 })).toThrow();
  });
});
