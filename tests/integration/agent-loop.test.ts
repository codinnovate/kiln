import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentLoop } from '../../src/agent/loop.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ContextEngine } from '../../src/context/engine.js';
import { PermissionManager } from '../../src/permissions/manager.js';
import type { BaseProvider } from '../../src/providers/base.js';
import type { StreamChunk, ToolDefinition } from '../../src/models/provider.js';
import type { AgentConfig } from '../../src/agent/types.js';
import {
  readFileTool,
  writeFileTool,
  listDirectoryTool,
} from '../../src/tools/filesystem.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-integration-test-'));
}

function createMockProvider(chunksFn: (iteration: number) => StreamChunk[]): BaseProvider {
  let iteration = 0;
  return {
    type: 'openai' as const,
    name: 'mock',
    apiKey: 'test-key',
    async *stream(req): AsyncGenerator<StreamChunk> {
      iteration++;
      for (const chunk of chunksFn(iteration)) {
        yield chunk;
      }
    },
    async complete() {
      return {
        message: { role: 'assistant', content: 'done' },
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'mock',
      };
    },
    validate: () => true,
    formatMessages: () => [],
    formatTools: () => [],
    extractModelId: (m: string) => m.replace(/^[^/]+\//, ''),
    resolveModelProvider: () => 'openai',
  } as unknown as BaseProvider;
}

describe('AgentLoop integration', () => {
  let tmpDir: string;
  let permsPath: string;

  beforeEach(() => {
    tmpDir = createTempDir();
    permsPath = path.join(tmpDir, 'perms.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
    return {
      model: 'openai/gpt-4o',
      provider: 'openai',
      cwd: tmpDir,
      maxIterations: 10,
      ...overrides,
    };
  }

  it('completes a simple text-only conversation', async () => {
    const provider = createMockProvider(() => [
      { type: 'text_delta', text: 'Hello! How can I help?' },
      { type: 'usage', inputTokens: 50, outputTokens: 20 },
      { type: 'done' },
    ]);

    const tools = new ToolRegistry();
    const permissions = new PermissionManager({ storePath: permsPath });
    const context = new ContextEngine(tmpDir);
    const config = makeConfig();
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('Hello')) {
      events.push(event);
    }

    expect(events.filter((e) => e.type === 'text').length).toBe(1);
    expect(events.filter((e) => e.type === 'usage').length).toBe(1);
    expect(events.filter((e) => e.type === 'done').length).toBe(1);

    const state = loop.getState();
    expect(state.totalTokens.input).toBe(50);
    expect(state.totalTokens.output).toBe(20);
    expect(state.iterations).toBe(1);
  });

  it('executes filesystem tools through the loop', async () => {
    let iteration = 0;
    const provider = createMockProvider(() => {
      iteration++;
      if (iteration === 1) {
        return [
          {
            type: 'tool_call',
            toolCall: {
              id: 'call-write-1',
              name: 'write_file',
              arguments: JSON.stringify({
                path: path.join(tmpDir, 'output.txt'),
                content: 'Hello from integration test!',
              }),
            },
          },
          { type: 'done' },
        ];
      }
      return [
        { type: 'text_delta', text: 'File written successfully.' },
        { type: 'done' },
      ];
    });

    const tools = new ToolRegistry();
    tools.register(writeFileTool);
    tools.register(readFileTool);
    tools.register(listDirectoryTool);

    const permissions = new PermissionManager({ storePath: permsPath, autoApprove: true });
    const context = new ContextEngine(tmpDir);
    const config = makeConfig();
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('Write a test file')) {
      events.push(event);
    }

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolCallEvents.length).toBe(1);
    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].data).toHaveProperty('isError', false);

    // Verify the file was actually created
    const fileContent = await fs.readFile(path.join(tmpDir, 'output.txt'), 'utf-8');
    expect(fileContent).toBe('Hello from integration test!');
  });

  it('chains multiple tool calls across iterations', async () => {
    let iteration = 0;
    const provider = createMockProvider(() => {
      iteration++;
      if (iteration === 1) {
        return [
          {
            type: 'tool_call',
            toolCall: {
              id: 'call-1',
              name: 'write_file',
              arguments: JSON.stringify({
                path: path.join(tmpDir, 'data.txt'),
                content: 'test data',
              }),
            },
          },
          { type: 'done' },
        ];
      }
      if (iteration === 2) {
        return [
          {
            type: 'tool_call',
            toolCall: {
              id: 'call-2',
              name: 'read_file',
              arguments: JSON.stringify({
                path: path.join(tmpDir, 'data.txt'),
              }),
            },
          },
          { type: 'done' },
        ];
      }
      return [
        { type: 'text_delta', text: 'The file contains: test data' },
        { type: 'done' },
      ];
    });

    const tools = new ToolRegistry();
    tools.register(writeFileTool);
    tools.register(readFileTool);

    const permissions = new PermissionManager({ storePath: permsPath, autoApprove: true });
    const context = new ContextEngine(tmpDir);
    const config = makeConfig();
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('Create and read a file')) {
      events.push(event);
    }

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents.length).toBe(2);

    const state = loop.getState();
    expect(state.iterations).toBe(3);
    // 3 messages: user, assistant with toolCalls, tool result, assistant with toolCalls, tool result
    expect(state.messages.length).toBeGreaterThanOrEqual(4);
  });

  it('handles tool execution errors in loop', async () => {
    let iteration = 0;
    const provider = createMockProvider(() => {
      iteration++;
      if (iteration === 1) {
        return [
          {
            type: 'tool_call',
            toolCall: {
              id: 'call-error',
              name: 'read_file',
              arguments: JSON.stringify({
                path: path.join(tmpDir, 'nonexistent.txt'),
              }),
            },
          },
          { type: 'done' },
        ];
      }
      return [
        { type: 'text_delta', text: 'The file was not found.' },
        { type: 'done' },
      ];
    });

    const tools = new ToolRegistry();
    tools.register(readFileTool);

    const permissions = new PermissionManager({ storePath: permsPath, autoApprove: true });
    const context = new ContextEngine(tmpDir);
    const config = makeConfig();
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('Read nonexistent file')) {
      events.push(event);
    }

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].data).toHaveProperty('isError', true);
  });

  it('stops after max iterations', async () => {
    let iteration = 0;
    const provider = createMockProvider(() => {
      iteration++;
      return [
        {
          type: 'tool_call',
          toolCall: {
            id: `call-${iteration}`,
            name: 'loop_tool',
            arguments: '{}',
          },
        },
        { type: 'done' },
      ];
    });

    const tools = new ToolRegistry();
    tools.register({
      name: 'loop_tool',
      description: 'Loop',
      parameters: {},
      execute: async () => ({ toolCallId: '', content: 'ok', isError: false }),
    });

    const permissions = new PermissionManager({ storePath: permsPath, autoApprove: true });
    const context = new ContextEngine(tmpDir);
    const config = makeConfig({ maxIterations: 3 });
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('loop forever')) {
      events.push(event);
    }

    const errorEvents = events.filter(
      (e) => e.type === 'error' && (e.data as any).message?.includes('maximum'),
    );
    expect(errorEvents.length).toBe(1);

    const state = loop.getState();
    expect(state.iterations).toBe(3);
  });

  it('respects permission denials for tools', async () => {
    let iteration = 0;
    const provider = createMockProvider(() => {
      iteration++;
      if (iteration === 1) {
        return [
          {
            type: 'tool_call',
            toolCall: {
              id: 'call-denied',
              name: 'write_file',
              arguments: JSON.stringify({
                path: path.join(tmpDir, 'secret.txt'),
                content: 'secret',
              }),
            },
          },
          { type: 'done' },
        ];
      }
      return [
        { type: 'text_delta', text: 'Write was denied.' },
        { type: 'done' },
      ];
    });

    const tools = new ToolRegistry();
    tools.register(writeFileTool);

    const permissions = new PermissionManager({
      storePath: permsPath,
      autoApprove: false,
      onPrompt: async () => ({ action: 'deny' }),
    });

    const context = new ContextEngine(tmpDir);
    const config = makeConfig();
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('Write a file')) {
      events.push(event);
    }

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].data).toHaveProperty('isError', true);
    expect((toolResultEvents[0].data as any).content).toContain('denied');

    // File should NOT exist
    expect(fs.existsSync(path.join(tmpDir, 'secret.txt'))).toBe(false);
  });

  it('handles mixed text and tool calls in one response', async () => {
    let iteration = 0;
    const provider = createMockProvider(() => {
      iteration++;
      if (iteration === 1) {
        return [
          { type: 'text_delta', text: 'I will create a file now. ' },
          {
            type: 'tool_call',
            toolCall: {
              id: 'call-mixed',
              name: 'write_file',
              arguments: JSON.stringify({
                path: path.join(tmpDir, 'mixed.txt'),
                content: 'created',
              }),
            },
          },
          { type: 'done' },
        ];
      }
      return [
        { type: 'text_delta', text: 'File created!' },
        { type: 'done' },
      ];
    });

    const tools = new ToolRegistry();
    tools.register(writeFileTool);

    const permissions = new PermissionManager({ storePath: permsPath, autoApprove: true });
    const context = new ContextEngine(tmpDir);
    const config = makeConfig();
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('create a file')) {
      events.push(event);
    }

    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents.length).toBe(2);
    expect(textEvents[0].data).toHaveProperty('text', 'I will create a file now. ');
    expect(textEvents[1].data).toHaveProperty('text', 'File created!');

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents.length).toBe(1);

    const fileExists = fs.existsSync(path.join(tmpDir, 'mixed.txt'));
    expect(fileExists).toBe(true);
  });
});
