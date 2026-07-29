import { describe, it, expect, vi } from 'vitest';
import type {
  Message,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  ToolDefinition,
  ContentPart,
  ToolResult,
} from '../../src/models/provider.js';
import { ProviderError } from '../../src/providers/base.js';

vi.mock('openai', () => {
  const MockOpenAI = vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  }));
  MockOpenAI.ChatCompletionStream = vi.fn();
  return { default: MockOpenAI };
});

vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn(() => ({
    messages: {
      stream: vi.fn(),
      create: vi.fn(),
    },
  }));
  return { default: MockAnthropic };
});

vi.mock('@google/generative-ai', () => {
  class MockGoogleGenerativeAI {
    constructor(_apiKey: string) {}
    getGenerativeModel() {
      return {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
      };
    }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

import { BaseProvider } from '../../src/providers/base.js';
import { OpenAIProvider } from '../../src/providers/openai.js';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { GoogleProvider } from '../../src/providers/google.js';
import { OpenRouterProvider } from '../../src/providers/openrouter.js';
import { OllamaProvider } from '../../src/providers/ollama.js';
import { CustomProvider } from '../../src/providers/custom.js';
import type { RetryConfig } from '../../src/providers/retry.js';

class TestableOpenAI extends OpenAIProvider {
  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
  }
  public testFormatMessages(messages: Message[]) {
    return this.formatMessages(messages);
  }
  public testFormatTools(tools?: ToolDefinition[]) {
    return this.formatTools(tools);
  }
  public testFormatUserContent(content: string | ContentPart[]) {
    return (this as any).formatUserContent(content);
  }
  public testExtractToolResults(content: string | ContentPart[]) {
    return (this as any).extractToolResults(content);
  }
  public testExtractTextContent(content: string | ContentPart[]) {
    return (this as any).extractTextContent(content);
  }
}

class TestableAnthropic extends AnthropicProvider {
  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
  }
  public testFormatMessages(messages: Message[]) {
    return this.formatMessages(messages);
  }
  public testFormatTools(tools?: ToolDefinition[]) {
    return this.formatTools(tools);
  }
  public testSplitSystemMessages(messages: Message[]) {
    return (this as any).splitSystemMessages(messages);
  }
  public testFormatContentBlocks(content: string | ContentPart[]) {
    return (this as any).formatContentBlocks(content);
  }
  public testExtractToolResults(content: string | ContentPart[]) {
    return (this as any).extractToolResults(content);
  }
  public testExtractText(content: string | ContentPart[]) {
    return (this as any).extractText(content);
  }
}

class TestableGoogle extends GoogleProvider {
  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
  }
  public testFormatMessages(messages: Message[]) {
    return this.formatMessages(messages);
  }
  public testFormatTools(tools?: ToolDefinition[]) {
    return this.formatTools(tools);
  }
  public testBuildRequest(request: CompletionRequest) {
    return (this as any).buildRequest(request);
  }
  public testExtractText(content: string | ContentPart[]) {
    return (this as any).extractText(content);
  }
}

class TestableOpenRouter extends OpenRouterProvider {
  constructor(apiKey?: string, baseUrl?: string, options?: { referer?: string; title?: string }) {
    super(apiKey, baseUrl, options);
  }
  public testMapModelId(model: string) {
    return (this as any).mapModelId(model);
  }
  public testFormatTools(tools?: ToolDefinition[]) {
    return this.formatTools(tools);
  }
}

class TestableBase extends BaseProvider {
  readonly type = 'openai' as const;
  readonly name = 'TestBase';

  public setTestRetryConfig(overrides: Partial<RetryConfig>) {
    Object.assign(this.retryConfig, overrides);
  }

  public testExtractModelId(model: string) {
    return this.extractModelId(model);
  }
  public testCreateErrorResponse(error: unknown): never {
    return this.createErrorResponse(error);
  }
  public testRetryComplete(fn: () => Promise<CompletionResponse>) {
    return this.retryComplete(fn);
  }
  public async *testStreamWithRetry(
    createStream: () => AsyncGenerator<StreamChunk>,
  ): AsyncGenerator<StreamChunk> {
    yield* this.streamWithRetry(createStream);
  }

  async complete(_request: CompletionRequest): Promise<CompletionResponse> {
    return { message: { role: 'assistant', content: '' }, usage: { inputTokens: 0, outputTokens: 0 }, model: 'test' };
  }
  async *stream(_request: CompletionRequest): AsyncGenerator<StreamChunk> {
    yield { type: 'done' };
  }
  protected formatMessages(_messages: Message[]): unknown[] {
    return [];
  }
  protected formatTools(_tools?: ToolDefinition[]): unknown[] | undefined {
    return undefined;
  }
}

describe('BaseProvider', () => {
  describe('extractModelId', () => {
    it('extracts model ID after slash for registered models', () => {
      const bp = new TestableBase('sk-test');
      expect(bp.testExtractModelId('openai/gpt-4o')).toBe('gpt-4o');
    });

    it('extracts model ID after slash for unregistered models', () => {
      const bp = new TestableBase('sk-test');
      expect(bp.testExtractModelId('openai/gpt-5')).toBe('gpt-5');
    });

    it('passes through model without slash', () => {
      const bp = new TestableBase('sk-test');
      expect(bp.testExtractModelId('gpt-4o')).toBe('gpt-4o');
    });

    it('handles empty model string', () => {
      const bp = new TestableBase('sk-test');
      expect(bp.testExtractModelId('')).toBe('');
    });
  });

  describe('createErrorResponse', () => {
    function createBP() {
      return new TestableBase('sk-test');
    }

    it('throws ProviderError for rate limit errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('Rate limit exceeded'));
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError);
        expect((e as ProviderError).code).toBe('RATE_LIMIT');
        expect((e as ProviderError).provider).toBe('openai');
      }
    });

    it('throws ProviderError for 429 errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('429 Too Many Requests'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('RATE_LIMIT');
      }
    });

    it('throws ProviderError for auth errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('Unauthorized - invalid API key'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('AUTH');
      }
    });

    it('throws ProviderError for 401 errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('401 Invalid API key'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('AUTH');
      }
    });

    it('throws ProviderError for quota errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('Quota exceeded'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('QUOTA');
      }
    });

    it('throws ProviderError for 402 errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('402 Payment Required'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('QUOTA');
      }
    });

    it('throws ProviderError for connection errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('ECONNREFUSED connection refused'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('CONNECTION');
      }
    });

    it('throws ProviderError for timeout errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('timeout exceeded'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('CONNECTION');
      }
    });

    it('throws ProviderError with UNKNOWN code for other errors', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse(new Error('Something unexpected happened'));
      } catch (e) {
        expect((e as ProviderError).code).toBe('UNKNOWN');
      }
    });

    it('throws ProviderError for non-Error input', () => {
      const bp = createBP();
      try {
        bp.testCreateErrorResponse('string error' as any);
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError);
        expect((e as ProviderError).code).toBe('UNKNOWN');
      }
    });
  });

  describe('retryComplete', () => {
    it('returns result on first success', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 1 });
      const mockResponse: CompletionResponse = {
        message: { role: 'assistant', content: 'hello' },
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'test',
      };
      const fn = vi.fn().mockResolvedValue(mockResponse);
      const result = await bp.testRetryComplete(fn);
      expect(result).toBe(mockResponse);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error then succeeds', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 3 });
      const mockResponse: CompletionResponse = {
        message: { role: 'assistant', content: 'hello' },
        usage: { inputTokens: 10, outputTokens: 5 },
        model: 'test',
      };
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(mockResponse);
      const result = await bp.testRetryComplete(fn);
      expect(result).toBe(mockResponse);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws non-retryable errors immediately', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 1 });
      const fn = vi.fn().mockRejectedValue(new Error('unauthorized'));
      await expect(bp.testRetryComplete(fn)).rejects.toThrow('unauthorized');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws after exhausting all retries', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 2 });
      const fn = vi.fn().mockRejectedValue(new Error('timeout'));
      await expect(bp.testRetryComplete(fn)).rejects.toThrow('timeout');
      expect(fn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('calls onRetry callback between retries', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 3 });
      const onRetry = vi.fn();
      bp.setOnRetry(onRetry);
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({ message: { role: 'assistant', content: '' }, usage: { inputTokens: 0, outputTokens: 0 }, model: 'test' });
      await bp.testRetryComplete(fn);
      expect(onRetry).toHaveBeenCalledTimes(3);
    }, 10000);
  });

  describe('streamWithRetry', () => {
    async function collectStream(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
      const chunks: StreamChunk[] = [];
      for await (const c of gen) chunks.push(c);
      return chunks;
    }

    it('yields all chunks on success', async () => {
      const bp = new TestableBase('sk-test');
      const chunks = await collectStream(bp.testStreamWithRetry(
        async function* () {
          yield { type: 'text_delta', text: 'hello' };
          yield { type: 'done' };
        },
      ));
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'text_delta', text: 'hello' });
    });

    it('retries on retryable error chunk', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 1 });
      let attempts = 0;
      const chunks = await collectStream(bp.testStreamWithRetry(
        async function* () {
          attempts++;
          if (attempts === 1) {
            yield { type: 'error', error: 'timeout' };
          } else {
            yield { type: 'text_delta', text: 'hello' };
            yield { type: 'done' };
          }
        },
      ));
      expect(chunks).toHaveLength(2);
      expect(attempts).toBe(2);
    });

    it('yields error chunk after exhausting retries', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 1 });
      const chunks = await collectStream(bp.testStreamWithRetry(
        async function* () {
          yield { type: 'error', error: 'timeout' };
        },
      ));
      const errors = chunks.filter((c) => c.type === 'error');
      expect(errors).toHaveLength(1);
    }, 10000);

    it('non-retryable error is not retried', async () => {
      const bp = new TestableBase('sk-test');
      bp.setTestRetryConfig({ baseDelay: 1, maxRetries: 1 });
      let attempts = 0;
      const chunks = await collectStream(bp.testStreamWithRetry(
        async function* () {
          attempts++;
          yield { type: 'error', error: 'unauthorized' };
        },
      ));
      expect(attempts).toBe(1);
      const errors = chunks.filter((c) => c.type === 'error');
      expect(errors).toHaveLength(1);
    });
  });

  describe('validate', () => {
    it('returns true with API key', () => {
      const bp = new TestableBase('sk-test');
      expect(bp.validate()).toBe(true);
    });

    it('returns false without API key', () => {
      const bp = new TestableBase();
      expect(bp.validate()).toBe(false);
    });
  });

  describe('ProviderError', () => {
    it('has correct name, code, provider, message', () => {
      const err = new ProviderError('test error', 'RATE_LIMIT', 'openai');
      expect(err.name).toBe('ProviderError');
      expect(err.code).toBe('RATE_LIMIT');
      expect(err.provider).toBe('openai');
      expect(err.message).toBe('test error');
    });
  });
});

describe('OpenAIProvider', () => {
  describe('constructor and validate', () => {
    it('creates with API key', () => {
      const p = new TestableOpenAI('sk-test');
      expect(p.type).toBe('openai');
      expect(p.name).toBe('OpenAI');
      expect(p.validate()).toBe(true);
    });

    it('creates without API key', () => {
      const p = new TestableOpenAI();
      expect(p.type).toBe('openai');
      expect(p.validate()).toBe(false);
    });
  });

  describe('formatMessages', () => {
    it('formats system message', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatMessages([{ role: 'system', content: 'Be helpful' }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'system', content: 'Be helpful' });
    });

    it('formats user message with string content', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatMessages([{ role: 'user', content: 'Hello' }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('formats user message with ContentPart array', () => {
      const p = new TestableOpenAI('sk-test');
      const parts: ContentPart[] = [
        { type: 'text', text: 'What is this image?' },
        { type: 'image_url', imageUrl: 'https://example.com/img.jpg' },
      ];
      const result = p.testFormatMessages([{ role: 'user', content: parts }]);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBeInstanceOf(Array);
    });

    it('formats assistant message with tool calls', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatMessages([{
        role: 'assistant',
        content: 'Let me check',
        toolCalls: [{ id: 'call_1', name: 'get_weather', arguments: '{"city":"NYC"}' }],
      }]);
      expect(result).toHaveLength(1);
      const msg = result[0] as any;
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Let me check');
      expect(msg.tool_calls).toHaveLength(1);
      expect(msg.tool_calls[0].id).toBe('call_1');
      expect(msg.tool_calls[0].function.name).toBe('get_weather');
    });

    it('formats tool role message with string content', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatMessages([{
        role: 'tool',
        content: 'Weather is sunny',
        toolCallId: 'call_1',
      }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'tool', tool_call_id: '', content: 'Weather is sunny' });
    });

    it('formats tool role message with ContentPart tool result', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatMessages([{
        role: 'tool',
        content: [{ type: 'tool_result', toolResult: { toolCallId: 'call_1', content: 'result', isError: false } }],
      }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: 'result' });
    });

    it('formats assistant message with ContentPart content', () => {
      const p = new TestableOpenAI('sk-test');
      const parts: ContentPart[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ];
      const result = p.testFormatMessages([{ role: 'assistant', content: parts }]);
      const msg = result[0] as any;
      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hello World');
    });
  });

  describe('formatTools', () => {
    it('returns undefined for no tools', () => {
      const p = new TestableOpenAI('sk-test');
      expect(p.testFormatTools()).toBeUndefined();
    });

    it('returns undefined for empty tools array', () => {
      const p = new TestableOpenAI('sk-test');
      expect(p.testFormatTools([])).toBeUndefined();
    });

    it('formats tool definitions', () => {
      const p = new TestableOpenAI('sk-test');
      const tools: ToolDefinition[] = [
        { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
      ];
      const result = p.testFormatTools(tools);
      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      });
    });
  });

  describe('formatUserContent', () => {
    it('passes through string content', () => {
      const p = new TestableOpenAI('sk-test');
      expect(p.testFormatUserContent('hello')).toBe('hello');
    });

    it('formats text parts', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatUserContent([{ type: 'text', text: 'hello' }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', text: 'hello' });
    });

    it('formats image_url parts', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testFormatUserContent([{ type: 'image_url', imageUrl: 'https://example.com/img.jpg' }]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('image_url');
      expect((result[0] as any).image_url.url).toBe('https://example.com/img.jpg');
    });
  });

  describe('extractToolResults', () => {
    it('wraps string content', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testExtractToolResults('tool result');
      expect(result).toEqual([{ toolCallId: '', content: 'tool result', isError: false }]);
    });

    it('extracts from ContentPart array', () => {
      const p = new TestableOpenAI('sk-test');
      const tr: ToolResult = { toolCallId: 'call_1', content: 'result', isError: false };
      const result = p.testExtractToolResults([{ type: 'tool_result', toolResult: tr }]);
      expect(result).toEqual([tr]);
    });

    it('skips non-tool_result parts', () => {
      const p = new TestableOpenAI('sk-test');
      const result = p.testExtractToolResults([
        { type: 'text', text: 'hello' },
        { type: 'tool_result', toolResult: { toolCallId: 'c1', content: 'r1', isError: false } },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('r1');
    });
  });

  describe('extractTextContent', () => {
    it('passes through string', () => {
      const p = new TestableOpenAI('sk-test');
      expect(p.testExtractTextContent('hello')).toBe('hello');
    });

    it('joins text parts', () => {
      const p = new TestableOpenAI('sk-test');
      const parts: ContentPart[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'World' },
      ];
      expect(p.testExtractTextContent(parts)).toBe('Hello World');
    });

    it('skips non-text parts', () => {
      const p = new TestableOpenAI('sk-test');
      const parts: ContentPart[] = [
        { type: 'text', text: 'Hello' },
        { type: 'image_url', imageUrl: 'https://example.com/img.jpg' },
      ];
      expect(p.testExtractTextContent(parts)).toBe('Hello');
    });
  });
});

describe('AnthropicProvider', () => {
  describe('constructor and validate', () => {
    it('creates with API key', () => {
      const p = new TestableAnthropic('sk-ant-test');
      expect(p.type).toBe('anthropic');
      expect(p.name).toBe('Anthropic');
      expect(p.validate()).toBe(true);
    });

    it('creates without API key', () => {
      const p = new TestableAnthropic();
      expect(p.validate()).toBe(false);
    });
  });

  describe('formatMessages', () => {
    it('skips system messages', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatMessages([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hello' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('formats user message with string content', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatMessages([{ role: 'user', content: 'Hello' }]);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
      expect(result[0].content).toBe('Hello');
    });

    it('formats user message with ContentPart text and image', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const parts: ContentPart[] = [
        { type: 'text', text: 'Describe this:' },
        { type: 'image_url', imageUrl: 'https://example.com/img.jpg' },
      ];
      const result = p.testFormatMessages([{ role: 'user', content: parts }]);
      expect(result[0].content).toBeInstanceOf(Array);
    });

    it('formats assistant message with text', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatMessages([{ role: 'assistant', content: 'Hello' }]);
      expect(result[0].role).toBe('assistant');
      expect((result[0].content as any[])[0].type).toBe('text');
    });

    it('formats assistant message with tool calls', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatMessages([{
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: '{"city":"NYC"}' }],
      }]);
      const content = result[0].content as any[];
      expect(content[0].type).toBe('tool_use');
      expect(content[0].id).toBe('toolu_1');
      expect(content[0].name).toBe('get_weather');
    });

    it('formats tool role messages as user with tool_result', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatMessages([{
        role: 'tool',
        content: 'Weather result',
        toolCallId: 'toolu_1',
      }]);
      expect(result[0].role).toBe('user');
      const content = result[0].content as any[];
      expect(content[0].type).toBe('tool_result');
      expect(content[0].tool_use_id).toBe('');
    });

    it('handles malformed tool call JSON gracefully', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatMessages([{
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'toolu_1', name: 'get_weather', arguments: 'not-json' }],
      }]);
      const content = result[0].content as any[];
      expect(content[0].input).toEqual({ raw: 'not-json' });
    });
  });

  describe('formatTools', () => {
    it('formats tools with input_schema', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const tools: ToolDefinition[] = [
        { name: 'get_weather', description: 'Get weather', parameters: { type: 'object' } },
      ];
      const result = p.testFormatTools(tools);
      expect(result).toHaveLength(1);
      expect(result![0].name).toBe('get_weather');
      expect(result![0].description).toBe('Get weather');
      expect(result![0].input_schema).toEqual({ type: 'object' });
    });
  });

  describe('splitSystemMessages', () => {
    it('separates system messages', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const { system, messages } = p.testSplitSystemMessages([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' },
        { role: 'system', content: 'Be concise' },
        { role: 'assistant', content: 'Ok' },
      ]);
      expect(system).toBe('Be helpful\n\nBe concise');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('returns empty system with no system messages', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const { system, messages } = p.testSplitSystemMessages([
        { role: 'user', content: 'Hi' },
      ]);
      expect(system).toBe('');
      expect(messages).toHaveLength(1);
    });
  });

  describe('formatContentBlocks', () => {
    it('passes through string content', () => {
      const p = new TestableAnthropic('sk-ant-test');
      expect(p.testFormatContentBlocks('hello')).toBe('hello');
    });

    it('formats text parts', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatContentBlocks([{ type: 'text', text: 'hello' }]);
      expect(result[0]).toEqual({ type: 'text', text: 'hello' });
    });

    it('formats image_url parts as image source', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testFormatContentBlocks([{ type: 'image_url', imageUrl: 'https://example.com/img.jpg' }]);
      expect(result[0].type).toBe('image');
      expect(result[0].source.url).toBe('https://example.com/img.jpg');
    });
  });

  describe('extractToolResults', () => {
    it('wraps string content', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const result = p.testExtractToolResults('result');
      expect(result).toEqual([{ toolCallId: '', content: 'result', isError: false }]);
    });

    it('extracts from ContentPart array', () => {
      const p = new TestableAnthropic('sk-ant-test');
      const tr: ToolResult = { toolCallId: 'toolu_1', content: 'result', isError: true };
      const result = p.testExtractToolResults([{ type: 'tool_result', toolResult: tr }]);
      expect(result).toEqual([tr]);
    });
  });

  describe('extractText', () => {
    it('passes through string', () => {
      const p = new TestableAnthropic('sk-ant-test');
      expect(p.testExtractText('hello')).toBe('hello');
    });

    it('joins text parts', () => {
      const p = new TestableAnthropic('sk-ant-test');
      expect(p.testExtractText([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }])).toBe('AB');
    });
  });
});

describe('GoogleProvider', () => {
  describe('constructor and validate', () => {
    it('creates with API key', () => {
      const p = new TestableGoogle('google-key');
      expect(p.type).toBe('google');
      expect(p.name).toBe('Google');
      expect(p.validate()).toBe(true);
    });

    it('creates without API key', () => {
      const p = new TestableGoogle();
      expect(p.validate()).toBe(false);
    });
  });

  describe('formatMessages', () => {
    it('skips system messages', () => {
      const p = new TestableGoogle('gk');
      const result = p.testFormatMessages([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('maps assistant to model role', () => {
      const p = new TestableGoogle('gk');
      const result = p.testFormatMessages([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
      ]);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('model');
    });

    it('formats user message with string content', () => {
      const p = new TestableGoogle('gk');
      const result = p.testFormatMessages([{ role: 'user', content: 'Hello' }]);
      expect(result[0].role).toBe('user');
      expect(result[0].parts[0].text).toBe('Hello');
    });

    it('formats user message with ContentPart array', () => {
      const p = new TestableGoogle('gk');
      const parts: ContentPart[] = [
        { type: 'text', text: 'text' },
        { type: 'image_url', imageUrl: 'https://example.com/img.jpg' },
      ];
      const result = p.testFormatMessages([{ role: 'user', content: parts }]);
      expect(result[0].parts).toHaveLength(2);
    });

    it('formats assistant message with tool calls', () => {
      const p = new TestableGoogle('gk');
      const result = p.testFormatMessages([{
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'fc_1', name: 'get_weather', arguments: '{"city":"NYC"}' }],
      }]);
      const parts = result[0].parts;
      expect(parts[0].text).toBe('');
      expect(parts[1].functionCall.name).toBe('get_weather');
    });

    it('handles malformed tool call JSON gracefully', () => {
      const p = new TestableGoogle('gk');
      const result = p.testFormatMessages([{
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'fc_1', name: 'get_weather', arguments: 'bad-json' }],
      }]);
      const parts = result[0].parts;
      expect(parts[1].functionCall.args).toEqual({ raw: 'bad-json' });
    });

    it('returns text part for empty string content', () => {
      const p = new TestableGoogle('gk');
      const result = p.testFormatMessages([{ role: 'user', content: '' }]);
      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0].text).toBe('');
    });
  });

  describe('formatTools', () => {
    it('formats tools with functionDeclarations wrapper', () => {
      const p = new TestableGoogle('gk');
      const tools: ToolDefinition[] = [
        { name: 'get_weather', description: 'Get weather', parameters: { type: 'object' } },
      ];
      const result = p.testFormatTools(tools);
      expect(result).toHaveLength(1);
      expect(result![0].functionDeclarations).toHaveLength(1);
      expect(result![0].functionDeclarations[0].name).toBe('get_weather');
    });

    it('returns undefined for no tools', () => {
      const p = new TestableGoogle('gk');
      expect(p.testFormatTools()).toBeUndefined();
    });
  });

  describe('buildRequest', () => {
    it('separates system instruction', () => {
      const p = new TestableGoogle('gk');
      const { systemInstruction, contents } = p.testBuildRequest({
        model: 'test',
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'Hello' },
        ],
      });
      expect(systemInstruction).toBe('System prompt');
      expect(contents).toHaveLength(1);
    });

    it('joins multiple system messages', () => {
      const p = new TestableGoogle('gk');
      const { systemInstruction } = p.testBuildRequest({
        model: 'test',
        messages: [
          { role: 'system', content: 'Part 1' },
          { role: 'system', content: 'Part 2' },
        ],
      });
      expect(systemInstruction).toBe('Part 1\n\nPart 2');
    });
  });

  describe('extractText', () => {
    it('passes through string', () => {
      const p = new TestableGoogle('gk');
      expect(p.testExtractText('hello')).toBe('hello');
    });

    it('joins text parts', () => {
      const p = new TestableGoogle('gk');
      expect(p.testExtractText([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }])).toBe('AB');
    });
  });
});

describe('OpenRouterProvider', () => {
  describe('constructor and validate', () => {
    it('creates with default title', () => {
      const p = new TestableOpenRouter('sk-or-test');
      expect(p.type).toBe('openrouter');
      expect(p.name).toBe('OpenRouter');
      expect(p.validate()).toBe(true);
    });

    it('creates without API key', () => {
      const p = new TestableOpenRouter();
      expect(p.type).toBe('openrouter');
      expect(p.validate()).toBe(false);
    });
  });

  describe('mapModelId', () => {
    it('strips known provider prefix', () => {
      const p = new TestableOpenRouter('sk-or-test');
      expect(p.testMapModelId('openai/gpt-4o')).toBe('gpt-4o');
    });

    it('preserves model id that starts with provider prefix', () => {
      const p = new TestableOpenRouter('sk-or-test');
      const result = p.testMapModelId('openai/anthropic/claude-3-opus');
      expect(result).toBe('anthropic/claude-3-opus');
    });

    it('preserves meta-llama prefixed model', () => {
      const p = new TestableOpenRouter('sk-or-test');
      const result = p.testMapModelId('openrouter/meta-llama/llama-3-70b');
      expect(result).toBe('meta-llama/llama-3-70b');
    });
  });

  describe('formatTools', () => {
    it('inherits OpenAI tool formatting', () => {
      const p = new TestableOpenRouter('sk-or-test');
      const tools: ToolDefinition[] = [
        { name: 'test', description: 'Test tool', parameters: { type: 'object' } },
      ];
      const result = p.testFormatTools(tools);
      expect(result).toHaveLength(1);
      expect(result![0].type).toBe('function');
    });
  });
});

describe('OllamaProvider', () => {
  it('creates and validates', () => {
    const p = new OllamaProvider();
    expect(p.type).toBe('ollama');
    expect(p.name).toBe('Ollama');
    expect(p.validate()).toBe(true);
  });

  it('creates with custom baseUrl', () => {
    const p = new OllamaProvider(undefined, 'http://custom:11434');
    expect(p.validate()).toBe(true);
  });

  it('always validates true', () => {
    const p = new OllamaProvider();
    expect(p.validate()).toBe(true);
  });
});

describe('CustomProvider', () => {
  it('creates with API key and baseUrl', () => {
    const p = new CustomProvider('sk-test', 'https://custom.api.com', 'My Custom');
    expect(p.type).toBe('custom');
    expect(p.name).toBe('My Custom');
    expect(p.validate()).toBe(true);
  });

  it('uses default name when not provided', () => {
    const p = new CustomProvider('sk-test', 'https://custom.api.com');
    expect(p.name).toBe('Custom');
  });

  it('validates with baseUrl but no API key', () => {
    const p = new CustomProvider(undefined, 'https://custom.api.com');
    expect(p.validate()).toBe(true);
  });

  it('throws without baseUrl', () => {
    expect(() => new CustomProvider('sk-test')).toThrow('baseUrl');
  });
});

describe('createProvider', () => {
  it('createProvider is exported', async () => {
    const { createProvider } = await import('../../src/providers/index.js');
    expect(typeof createProvider).toBe('function');
  });
});
