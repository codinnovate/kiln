import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/prompts.js';
import { AgentLoop } from '../../src/agent/loop.js';
import type { AgentConfig, RepoInfo } from '../../src/agent/types.js';
import type { BaseProvider } from '../../src/providers/base.js';
import type { StreamChunk, Message } from '../../src/models/provider.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ContextEngine } from '../../src/context/engine.js';
import { PermissionManager } from '../../src/permissions/manager.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-agent-test-'));
}

const baseConfig: AgentConfig = {
  model: 'openai/gpt-4o',
  provider: 'openai',
  cwd: '/tmp/test',
  maxIterations: 20,
};

describe('buildSystemPrompt', () => {
  it('includes the default Kiln system prompt', () => {
    const prompt = buildSystemPrompt(baseConfig);
    expect(prompt).toContain('Kiln');
    expect(prompt).toContain('coding assistant');
    expect(prompt).toContain('Current working directory');
    expect(prompt).toContain('Model:');
  });

  it('includes the model name', () => {
    const prompt = buildSystemPrompt(baseConfig);
    expect(prompt).toContain('openai/gpt-4o');
  });

  it('includes the cwd', () => {
    const config = { ...baseConfig, cwd: '/my/project' };
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('/my/project');
  });

  it('uses custom system prompt when provided', () => {
    const config = { ...baseConfig, systemPrompt: 'Custom prompt' };
    const prompt = buildSystemPrompt(config);
    expect(prompt).toContain('Custom prompt');
    expect(prompt).not.toContain('You are Kiln');
  });

  it('includes repo info when provided', () => {
    const repoInfo: RepoInfo = {
      root: '/test/project',
      languages: { TypeScript: 10, Python: 5 },
      totalFiles: 15,
    };
    const prompt = buildSystemPrompt(baseConfig, repoInfo);
    expect(prompt).toContain('Project Context');
    expect(prompt).toContain('TypeScript');
    expect(prompt).toContain('Python');
    expect(prompt).toContain('15');
  });

  it('omits repo section when no repo info', () => {
    const prompt = buildSystemPrompt(baseConfig);
    expect(prompt).not.toContain('Project Context');
  });

  it('includes safety guidelines', () => {
    const prompt = buildSystemPrompt(baseConfig);
    expect(prompt).toContain('Safety');
    expect(prompt).toContain('destructive');
  });

  it('includes tool usage guidelines', () => {
    const prompt = buildSystemPrompt(baseConfig);
    expect(prompt).toContain('Tool Usage');
  });
});

describe('AgentLoop', () => {
  let tmpDir: string;
  let tools: ToolRegistry;
  let permissions: PermissionManager;
  let context: ContextEngine;

  function createMockProvider(
    chunks: StreamChunk[],
  ): BaseProvider {
    return {
      type: 'openai' as const,
      name: 'mock',
      apiKey: 'test',
      async *stream(): AsyncGenerator<StreamChunk> {
        for (const chunk of chunks) {
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
      extractModelId: (m: string) => m,
      resolveModelProvider: () => 'openai',
      setMaxRetries: () => {},
      setOnRetry: () => {},
    } as unknown as BaseProvider;
  }

  beforeEach(() => {
    tmpDir = createTempDir();
    tools = new ToolRegistry();
    permissions = new PermissionManager({ storePath: path.join(tmpDir, 'perms.json'), autoApprove: true });
    context = new ContextEngine(tmpDir);
  });

  it('initializes with correct state', async () => {
    const provider = createMockProvider([]);
    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);
    const state = loop.getState();
    expect(state.messages).toEqual([]);
    expect(state.iterations).toBe(0);
    expect(state.isComplete).toBe(true);
  });

  it('builds messages from chat history', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text_delta', text: 'Hello!' },
      { type: 'done' },
    ];
    const provider = createMockProvider(chunks);
    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);

    const events = [];
    for await (const event of loop.chat('Hi there')) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0].data).toHaveProperty('text', 'Hello!');
  });

  it('emits done event after completion', async () => {
    const chunks: StreamChunk[] = [
      { type: 'text_delta', text: 'Response' },
      { type: 'done' },
    ];
    const provider = createMockProvider(chunks);
    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);

    const events = [];
    for await (const event of loop.chat('test')) {
      events.push(event);
    }

    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents.length).toBe(1);
    expect(doneEvents[0].data).toHaveProperty('iterations');
    expect(doneEvents[0].data).toHaveProperty('totalTokens');
  });

  it('executes tool calls in the loop', async () => {
    tools.register({
      name: 'test_tool',
      description: 'Test',
      parameters: {},
      execute: async () => ({ toolCallId: 'tc-1', content: 'tool result', isError: false }),
    });

    const chunks: StreamChunk[] = [
      {
        type: 'tool_call',
        toolCall: { id: 'tc-1', name: 'test_tool', arguments: '{}' },
      },
      { type: 'done' },
    ];

    // Second iteration returns text only (no more tool calls)
    let callCount = 0;
    const provider = createMockProvider([]);
    provider.stream = async function* () {
      callCount++;
      if (callCount === 1) {
        yield {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'test_tool', arguments: '{}' },
        };
      } else {
        yield { type: 'text_delta', text: 'Done with tools' };
      }
      yield { type: 'done' };
    } as unknown as BaseProvider['stream'];

    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);
    const events = [];
    for await (const event of loop.chat('use test_tool')) {
      events.push(event);
    }

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents.length).toBe(1);

    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents.length).toBe(1);
    expect(toolResultEvents[0].data).toHaveProperty('content', 'tool result');
  });

  it('respects max iterations limit', async () => {
    let callCount = 0;
    const provider = createMockProvider([]);
    provider.stream = async function* () {
      callCount++;
      // Always return a tool call to keep the loop going
      yield {
        type: 'tool_call',
        toolCall: { id: `tc-${callCount}`, name: 'loop_tool', arguments: '{}' },
      };
      yield { type: 'done' };
    } as unknown as BaseProvider['stream'];

    tools.register({
      name: 'loop_tool',
      description: 'Infinite loop tool',
      parameters: {},
      execute: async () => ({ toolCallId: '', content: 'ok', isError: false }),
    });

    const config = { ...baseConfig, maxIterations: 3 };
    const loop = new AgentLoop(provider, tools, context, permissions, config);

    const events = [];
    for await (const event of loop.chat('loop forever')) {
      events.push(event);
    }

    const errorEvents = events.filter(
      (e) => e.type === 'error' && (e.data as { message: string }).message?.includes('maximum'),
    );
    expect(errorEvents.length).toBe(1);
  });

  it('handles provider errors gracefully', async () => {
    const provider = createMockProvider([]);
    provider.stream = async function* () {
      yield { type: 'error', error: 'API Error: rate limited' };
    } as unknown as BaseProvider['stream'];

    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);
    const events = [];
    for await (const event of loop.chat('trigger error')) {
      events.push(event);
    }

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('emits usage events', async () => {
    const provider = createMockProvider([]);
    provider.stream = async function* () {
      yield { type: 'text_delta', text: 'Response' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done' };
    } as unknown as BaseProvider['stream'];

    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);
    const events = [];
    for await (const event of loop.chat('test')) {
      events.push(event);
    }

    const usageEvents = events.filter((e) => e.type === 'usage');
    expect(usageEvents.length).toBe(1);
    expect(usageEvents[0].data).toEqual({ input: 100, output: 50 });
  });

  it('registers and removes event handlers', async () => {
    const provider = createMockProvider([
      { type: 'text_delta', text: 'Hi' },
      { type: 'done' },
    ]);
    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);

    const handler = vi.fn();
    loop.on('text', handler);
    for await (const _ of loop.chat('test')) { /* consume */ }
    expect(handler).toHaveBeenCalled();

    loop.off('text', handler);
    loop.reset();
    const handler2 = vi.fn();
    loop.on('text', handler2);
    for await (const _ of loop.chat('test2')) { /* consume */ }
    // handler should not be called since it was removed
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reset clears state', async () => {
    const provider = createMockProvider([
      { type: 'text_delta', text: 'msg' },
      { type: 'done' },
    ]);
    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);

    for await (const _ of loop.chat('test')) { /* consume */ }
    expect(loop.getMessages().length).toBeGreaterThan(0);

    loop.reset();
    expect(loop.getMessages()).toEqual([]);
    expect(loop.getState().iterations).toBe(0);
  });

  it('abort stops the loop', async () => {
    let yielded = false;
    const provider = createMockProvider([]);
    provider.stream = async function* () {
      if (!yielded) {
        yielded = true;
        yield { type: 'text_delta', text: 'starting...' };
        // Simulate slow response - abort should be picked up
        yield { type: 'text_delta', text: ' done' };
      }
      yield { type: 'done' };
    } as unknown as BaseProvider['stream'];

    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);

    // Start consuming, then abort after first event
    const events: unknown[] = [];
    const gen = loop.chat('long task');
    const first = await gen.next();
    events.push(first.value);
    loop.abort();
    // Consume remaining
    for await (const event of gen) {
      events.push(event);
    }

    // Should have completed (done event is always emitted)
    const doneEvents = events.filter(
      (e: any) => e?.type === 'done',
    );
    expect(doneEvents.length).toBe(1);
  });

  it('getMessages returns a copy', async () => {
    const provider = createMockProvider([
      { type: 'text_delta', text: 'Hi' },
      { type: 'done' },
    ]);
    const loop = new AgentLoop(provider, tools, context, permissions, baseConfig);
    for await (const _ of loop.chat('test')) { /* consume */ }

    const msgs1 = loop.getMessages();
    const msgs2 = loop.getMessages();
    expect(msgs1).not.toBe(msgs2);
    expect(msgs1).toEqual(msgs2);
  });
});
