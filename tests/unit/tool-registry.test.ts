import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { ToolHandler, ToolContext } from '../../src/tools/registry.js';
import type { ToolCall } from '../../src/models/provider.js';

function makeContext(cwd: string = '/tmp'): ToolContext {
  return {
    cwd,
    permissions: {
      approve: () => true,
    },
  };
}

function makeTool(overrides: Partial<ToolHandler> = {}): ToolHandler {
  return {
    name: 'test_tool',
    description: 'A test tool',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ toolCallId: '', content: 'ok', isError: false }),
    ...overrides,
  };
}

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'call-1',
    name: 'test_tool',
    arguments: '{}',
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register and get', () => {
    it('registers a tool and retrieves it by name', () => {
      const tool = makeTool({ name: 'my_tool' });
      registry.register(tool);
      expect(registry.get('my_tool')).toBe(tool);
    });

    it('returns undefined for unknown tool name', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('overwrites tool with same name', () => {
      const tool1 = makeTool({ name: 'x', description: 'version 1' });
      const tool2 = makeTool({ name: 'x', description: 'version 2' });
      registry.register(tool1);
      registry.register(tool2);
      expect(registry.list()).toHaveLength(1);
      expect(registry.get('x')!.description).toBe('version 2');
    });
  });

  describe('list', () => {
    it('returns empty array when no tools registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered tools', () => {
      const tool1 = makeTool({ name: 'a' });
      const tool2 = makeTool({ name: 'b' });
      const tool3 = makeTool({ name: 'c' });
      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);
      const list = registry.list();
      expect(list).toHaveLength(3);
      expect(list).toContain(tool1);
      expect(list).toContain(tool2);
      expect(list).toContain(tool3);
    });
  });

  describe('getDefinitions', () => {
    it('returns empty array when no tools registered', () => {
      expect(registry.getDefinitions()).toEqual([]);
    });

    it('returns definitions for all tools', () => {
      registry.register(makeTool({
        name: 'read_file',
        description: 'Reads a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      }));
      registry.register(makeTool({
        name: 'write_file',
        description: 'Writes a file',
        parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } },
      }));

      const defs = registry.getDefinitions();
      expect(defs).toHaveLength(2);

      const readFileDef = defs.find((d) => d.name === 'read_file');
      expect(readFileDef).toBeDefined();
      expect(readFileDef!.description).toBe('Reads a file');
      expect(readFileDef!.parameters).toEqual({ type: 'object', properties: { path: { type: 'string' } } });

      const writeFileDef = defs.find((d) => d.name === 'write_file');
      expect(writeFileDef).toBeDefined();
      expect(writeFileDef!.description).toBe('Writes a file');
    });

    it('definitions have name, description, and parameters', () => {
      registry.register(makeTool({ name: 'x', description: 'X', parameters: { a: 1 } }));
      const defs = registry.getDefinitions();
      expect(defs[0]).toHaveProperty('name', 'x');
      expect(defs[0]).toHaveProperty('description', 'X');
      expect(defs[0]).toHaveProperty('parameters');
    });
  });

  describe('execute', () => {
    it('executes a registered tool and returns result', async () => {
      registry.register(makeTool({
        name: 'echo',
        execute: async (args) => ({
          toolCallId: 'echo-id',
          content: `echoed: ${args.message}`,
          isError: false,
        }),
      }));

      const result = await registry.execute(
        makeToolCall({ name: 'echo', arguments: JSON.stringify({ message: 'hello' }) }),
        makeContext(),
      );

      expect(result.content).toBe('echoed: hello');
      expect(result.isError).toBe(false);
      expect(result.toolCallId).toBe('echo-id');
    });

    it('returns error result for unknown tool', async () => {
      const result = await registry.execute(
        makeToolCall({ name: 'unknown_tool' }),
        makeContext(),
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Unknown tool');
      expect(result.content).toContain('unknown_tool');
    });

    it('returns error result for invalid JSON arguments', async () => {
      registry.register(makeTool({ name: 'test' }));

      const result = await registry.execute(
        makeToolCall({ name: 'test', arguments: 'not valid json{' }),
        makeContext(),
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid JSON');
    });

    it('returns error result when tool throws an Error', async () => {
      registry.register(makeTool({
        name: 'thrower',
        execute: async () => {
          throw new Error('something went wrong');
        },
      }));

      const result = await registry.execute(
        makeToolCall({ name: 'thrower' }),
        makeContext(),
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Tool execution error');
      expect(result.content).toContain('something went wrong');
    });

    it('returns error result when tool throws a non-Error value', async () => {
      registry.register(makeTool({
        name: 'thrower',
        execute: async () => {
          throw 'string error';
        },
      }));

      const result = await registry.execute(
        makeToolCall({ name: 'thrower' }),
        makeContext(),
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain('Tool execution error');
      expect(result.content).toContain('string error');
    });

    it('passes context to tool execute', async () => {
      let receivedContext: ToolContext | undefined;
      registry.register(makeTool({
        name: 'ctx_check',
        execute: async (_args, ctx) => {
          receivedContext = ctx;
          return { toolCallId: '', content: 'ok', isError: false };
        },
      }));

      const ctx = makeContext('/some/dir');
      await registry.execute(makeToolCall({ name: 'ctx_check' }), ctx);
      expect(receivedContext).toBe(ctx);
      expect(receivedContext!.cwd).toBe('/some/dir');
    });

    it('passes parsed arguments to tool execute', async () => {
      let receivedArgs: Record<string, unknown> = {};
      registry.register(makeTool({
        name: 'args_check',
        execute: async (args) => {
          receivedArgs = args;
          return { toolCallId: '', content: 'ok', isError: false };
        },
      }));

      const inputArgs = { path: '/tmp/test.txt', line: 42, flag: true };
      await registry.execute(
        makeToolCall({ name: 'args_check', arguments: JSON.stringify(inputArgs) }),
        makeContext(),
      );
      expect(receivedArgs).toEqual(inputArgs);
    });

    it('passes through toolCallId returned by the tool', async () => {
      registry.register(makeTool({
        name: 'echo',
        execute: async () => ({
          toolCallId: 'custom-id-123',
          content: 'ok',
          isError: false,
        }),
      }));
      const result = await registry.execute(
        makeToolCall({ name: 'echo', id: 'call-123' }),
        makeContext(),
      );
      expect(result.toolCallId).toBe('custom-id-123');
    });

    it('error result uses toolCallId from the tool call', async () => {
      const result = await registry.execute(
        makeToolCall({ name: 'missing', id: 'err-call-456' }),
        makeContext(),
      );
      expect(result.toolCallId).toBe('err-call-456');
      expect(result.isError).toBe(true);
    });
  });
});
