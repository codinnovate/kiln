import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalStdoutWrite = process.stdout.write;
const originalExit = process.exit;

let logOutput: string[] = [];
let errorOutput: string[] = [];

function captureLogs() {
  logOutput = [];
  errorOutput = [];
  console.log = vi.fn((...args: unknown[]) => {
    logOutput.push(args.map((a) => String(a)).join(' '));
  });
  console.error = vi.fn((...args: unknown[]) => {
    errorOutput.push(args.map((a) => String(a)).join(' '));
  });
  process.stdout.write = vi.fn();
}

function restoreLogs() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  process.stdout.write = originalStdoutWrite;
  process.exit = originalExit;
}

vi.mock('../../src/config/credentials.js', () => ({
  hasCredential: vi.fn(() => false),
  setCredential: vi.fn(),
  removeCredential: vi.fn(() => true),
  listCredentials: vi.fn(() => []),
  getCredential: vi.fn(() => undefined),
}));

vi.mock('../../src/config/loader.js', () => {
  const loadGlobalConfig = vi.fn(() => ({
    defaultProvider: 'openai',
    defaultModel: 'openai/gpt-4o',
    theme: 'dark',
    debug: false,
    providers: {},
    maxRetries: 3,
  }));

  const loadConfig = vi.fn(() => ({
    global: {
      defaultProvider: 'openai',
      defaultModel: 'openai/gpt-4o',
      theme: 'dark',
      debug: false,
      providers: {},
      maxRetries: 3,
    },
    project: {},
    credentials: {},
  }));

  const getConfigDir = vi.fn(() => '/tmp/.kiln');

  return { loadGlobalConfig, loadConfig, getConfigDir };
});

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  accessSync: vi.fn(),
  statSync: vi.fn(() => ({ mode: 0o600 })),
  chmodSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => Buffer.from('git version 2.39.0')),
}));

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn((_q: string, cb: (input: string) => void) => cb('')),
    close: vi.fn(),
  })),
}));

const mockSessionInfo = {
  id: 'test-session-123',
  title: 'Test Session',
  model: 'openai/gpt-4o',
  provider: 'openai',
  messageCount: 5,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  projectPath: '/test',
  summary: undefined,
};

vi.mock('../../src/sessions/manager.js', () => {
  const MockSessionManager = vi.fn(() => ({
    listSessions: vi.fn(async (_limit?: number) => [mockSessionInfo]),
    searchSessions: vi.fn(async (query: string) =>
      query === 'test' ? [mockSessionInfo] : [],
    ),
    resumeSession: vi.fn(async (_id: string) => ({
      metadata: {
        id: 'test-session-123',
        title: 'Test Session',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        model: 'openai/gpt-4o',
        provider: 'openai',
        projectPath: '/test',
        messageCount: 5,
      },
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      state: { totalTokens: { input: 10, output: 5 }, iterations: 1 },
    })),
    startNewSession: vi.fn(async (_config: unknown) => ({
      metadata: { id: 'test-session-123' },
    })),
    saveSession: vi.fn(async () => {}),
    generateTitle: vi.fn((_prompt: string) => 'Generated Title'),
  }));

  return { SessionManager: MockSessionManager };
});

function resetCommandOptions(cmd: { setOptionValue: (key: string, val: unknown) => void }) {
  cmd.setOptionValue('json', undefined);
  cmd.setOptionValue('provider', undefined);
}

describe('Models command', () => {
  let modelsCmd: { setOptionValue: (key: string, val: unknown) => void; parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    const mod = await import('../../src/cli/commands/models.js');
    modelsCmd = mod.modelsCommand as typeof modelsCmd;
    resetCommandOptions(modelsCmd);
  });

  afterEach(restoreLogs);

  it('lists all models in text format', async () => {
    const registry = await vi.importActual<typeof import('../../src/models/registry.js')>('../../src/models/registry.js');
    expect(registry.listModels().length).toBe(24);

    await modelsCmd.parseAsync(['node', 'kiln', 'models']);
    const output = logOutput.join('\n');
    expect(output).toContain('Available Models');
    expect(output).toContain('OPENAI');
    expect(output).toContain('GPT-4o');
    expect(output).toContain('ANTHROPIC');
    expect(output).toContain('ZEN');
  });

  it('outputs JSON with --json flag', async () => {
    await modelsCmd.parseAsync(['node', 'kiln', 'models', '--json']);

    expect(logOutput.length).toBeGreaterThan(0);
    const json = JSON.parse(logOutput[0]!);
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(24);
    expect(json[0]).toHaveProperty('id');
    expect(json[0]).toHaveProperty('name');
    expect(json[0]).toHaveProperty('hasApiKey');
  });

  it('filters by provider', async () => {
    await modelsCmd.parseAsync(['node', 'kiln', 'models', '--provider', 'openai']);

    const output = logOutput.join('\n');
    expect(output).toContain('OPENAI');
    expect(output).toContain('GPT-4o');
    expect(output).not.toContain('ANTHROPIC');
  });

  it('shows message for unknown provider', async () => {
    await modelsCmd.parseAsync(['node', 'kiln', 'models', '--provider', 'nonexistent']);

    const output = logOutput.join('\n');
    expect(output).toContain('No models found');
  });
});

describe('Auth command', () => {
  let authCmd: { setOptionValue: (key: string, val: unknown) => void; parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    const mod = await import('../../src/cli/commands/auth.js');
    authCmd = mod.authCommand as typeof authCmd;
  });

  afterEach(restoreLogs);

  it('shows provider status', async () => {
    await authCmd.parseAsync(['node', 'kiln', 'auth']);

    const output = logOutput.join('\n');
    expect(output).toContain('API Key Status');
    expect(output).toContain('openai');
    expect(output).toContain('anthropic');
    expect(output).toContain('ollama');
  });
});

describe('Auth subcommands', () => {
  let authCmd: { parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    process.exit = vi.fn(() => {
      throw new Error('process.exit called');
    }) as unknown as typeof process.exit;
    const mod = await import('../../src/cli/commands/auth.js');
    authCmd = mod.authCommand as typeof authCmd;
  });

  afterEach(restoreLogs);

  it('shows error for invalid provider on set', async () => {
    try {
      await authCmd.parseAsync(['node', 'test', 'set', 'invalid_provider']);
    } catch {
      // process.exit threw
    }
    expect(errorOutput.some((l) => l.includes('Invalid provider'))).toBe(true);
  });

  it('shows error for invalid provider on remove', async () => {
    try {
      await authCmd.parseAsync(['node', 'test', 'remove', 'invalid']);
    } catch {
      // process.exit threw
    }
    expect(errorOutput.some((l) => l.includes('Invalid provider'))).toBe(true);
  });

  it('shows info for ollama set', async () => {
    await authCmd.parseAsync(['node', 'test', 'set', 'ollama']);

    const output = logOutput.join('\n');
    expect(output).toContain('Ollama runs locally');
  });

  it('removes a credential', async () => {
    await authCmd.parseAsync(['node', 'test', 'remove', 'openai']);

    const output = logOutput.join('\n');
    expect(output).toContain('Removed API key for openai');
  });
});

describe('Config command', () => {
  let configCmd: { setOptionValue: (key: string, val: unknown) => void; parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    const mod = await import('../../src/cli/commands/config.js');
    configCmd = mod.configCommand as typeof configCmd;
  });

  afterEach(restoreLogs);

  it('shows current configuration', async () => {
    await configCmd.parseAsync(['node', 'kiln', 'config']);

    const output = logOutput.join('\n');
    expect(output).toContain('Configuration');
    expect(output).toContain('Default provider');
    expect(output).toContain('openai');
  });
});

describe('Config subcommands', () => {
  let configCmd: { setOptionValue: (key: string, val: unknown) => void; parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    process.exit = vi.fn(() => {
      throw new Error('process.exit called');
    }) as unknown as typeof process.exit;
    const mod = await import('../../src/cli/commands/config.js');
    configCmd = mod.configCommand as typeof configCmd;
  });

  afterEach(restoreLogs);

  it('gets a config key', async () => {
    await configCmd.parseAsync(['node', 'test', 'get', 'defaultProvider']);

    expect(logOutput[0]).toContain('openai');
  });

  it('gets a nested config key', async () => {
    await configCmd.parseAsync(['node', 'test', 'get', 'theme']);

    expect(logOutput[0]).toContain('dark');
  });

  it('shows error for missing config key', async () => {
    try {
      await configCmd.parseAsync(['node', 'test', 'get', 'nonexistent']);
    } catch {
      // process.exit threw
    }
    expect(logOutput.some((l) => l.includes('not set'))).toBe(true);
  });

  it('sets a config value', async () => {
    const fs = await import('node:fs');
    const writeSpy = vi.mocked(fs.writeFileSync);

    await configCmd.parseAsync(['node', 'test', 'set', 'theme', 'light']);

    expect(writeSpy).toHaveBeenCalled();
    const output = logOutput.join('\n');
    expect(output).toContain('Set');
    expect(output).toContain('theme');
    expect(output).toContain('light');
  });

  it('handles boolean config values', async () => {
    const fs = await import('node:fs');
    const writeSpy = vi.mocked(fs.writeFileSync);

    await configCmd.parseAsync(['node', 'test', 'set', 'debug', 'true']);

    expect(writeSpy).toHaveBeenCalled();
    const output = logOutput.join('\n');
    expect(output).toContain('true');
  });
});

describe('History command', () => {
  let historyCmd: { setOptionValue: (key: string, val: unknown) => void; parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    const mod = await import('../../src/cli/commands/history.js');
    historyCmd = mod.historyCommand as typeof historyCmd;
    historyCmd.setOptionValue('json', undefined);
    historyCmd.setOptionValue('limit', undefined);
  });

  afterEach(restoreLogs);

  it('lists sessions', async () => {
    await historyCmd.parseAsync(['node', 'kiln', 'history']);

    const output = logOutput.join('\n');
    expect(output).toContain('Session History');
    expect(output).toContain('Test Session');
  });

  it('outputs sessions as JSON', async () => {
    await historyCmd.parseAsync(['node', 'kiln', 'history', '--json']);

    expect(logOutput.length).toBeGreaterThan(0);
    const json = JSON.parse(logOutput[0]!);
    expect(Array.isArray(json)).toBe(true);
    expect(json[0]!.id).toBe('test-session-123');
    expect(json[0]!.title).toBe('Test Session');
  });
});

describe('History search', () => {
  let historyCmd: { parseAsync: (args: string[]) => Promise<unknown> };

  beforeEach(async () => {
    captureLogs();
    const mod = await import('../../src/cli/commands/history.js');
    historyCmd = mod.historyCommand as typeof historyCmd;
  });

  afterEach(restoreLogs);

  it('searches sessions by query', async () => {
    await historyCmd.parseAsync(['node', 'test', 'search', 'test']);

    const output = logOutput.join('\n');
    expect(output).toContain('test');
    expect(output).toContain('Test Session');
  });

  it('shows message when search finds no results', async () => {
    await historyCmd.parseAsync(['node', 'test', 'search', 'nonexistent']);

    const output = logOutput.join('\n');
    expect(output).toContain('No sessions matching');
  });
});

describe('Doctor command', () => {
  beforeEach(captureLogs);
  afterEach(restoreLogs);

  it('runs all health checks', async () => {
    const { doctorCommand } = await import('../../src/cli/commands/doctor.js');
    await doctorCommand.parseAsync(['node', 'kiln', 'doctor']);

    const output = logOutput.join('\n');
    expect(output).toContain('kiln doctor');
    expect(output).toContain('Node.js');
    expect(output).toContain('Platform');
    expect(output).toContain('Git');
    expect(output).toContain('passed');
  });
});

describe('Init command', () => {
  beforeEach(captureLogs);
  afterEach(restoreLogs);

  it('creates configuration files', async () => {
    const { initCommand } = await import('../../src/cli/commands/config.js');
    await initCommand();

    const output = logOutput.join('\n');
    expect(output).toContain('Initialized kiln configuration');
    expect(output).toContain('Global config');
    expect(output).toContain('Project dir');
  });
});

describe('Run command', () => {
  beforeEach(captureLogs);
  afterEach(restoreLogs);

  it('returns error for non-existent project path', async () => {
    const { runCommand } = await import('../../src/cli/commands/run.js');
    const result = await runCommand({
      projectPath: '/nonexistent/path/xyz789',
      debug: false,
      permissions: true,
      compact: false,
    });

    expect(result).toBe(1);
    expect(errorOutput.some((l) => l.includes('does not exist'))).toBe(true);
  });
});
