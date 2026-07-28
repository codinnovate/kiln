import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationCompactor } from '../../src/sessions/compaction.js';
import type { Message, CompletionResponse } from '../../src/models/provider.js';
import type { BaseProvider } from '../../src/providers/base.js';

function createMockProvider(summaryText: string = 'Summary of conversation'): BaseProvider {
  return {
    complete: vi.fn().mockResolvedValue({
      message: {
        role: 'assistant',
        content: summaryText,
      },
      usage: { inputTokens: 100, outputTokens: 50 },
      model: 'openai/gpt-4o-mini',
    } satisfies CompletionResponse),
    type: 'openai' as const,
    name: 'mock',
    apiKey: 'test',
    validate: vi.fn().mockReturnValue(true),
    setMaxRetries: vi.fn(),
    setOnRetry: vi.fn(),
    stream: vi.fn() as any,
  } as unknown as BaseProvider;
}

function makeMsg(role: Message['role'], content: string, overrides?: Partial<Message>): Message {
  return { role, content, ...overrides };
}

function makeTextContentMsg(role: Message['role'], text: string): Message {
  return {
    role,
    content: [{ type: 'text', text }],
  };
}

describe('ConversationCompactor', () => {
  describe('compact', () => {
    it('returns original messages when under target tokens', async () => {
      const provider = createMockProvider();
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('user', 'Hello'),
        makeMsg('assistant', 'Hi there!'),
      ];
      const result = await compactor.compact(messages, 10000);
      expect(result.messages).toEqual(messages);
      expect(result.summary).toBe('');
      expect(result.tokenSavings).toBe(0);
      expect(provider.complete).not.toHaveBeenCalled();
    });

    it('compacts when over target tokens', async () => {
      const provider = createMockProvider('Old conversation was about testing');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}: ${'x'.repeat(500)}`),
      );
      const result = await compactor.compact(messages, 100);
      expect(result.messages.length).toBeLessThan(messages.length);
      expect(result.summary).toBe('Old conversation was about testing');
      expect(result.tokenSavings).toBeGreaterThan(0);
    });

    it('preserves first message after compaction', async () => {
      const provider = createMockProvider('Summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('user', 'Initial system context and instructions here'),
        ...Array.from({ length: 10 }, (_, i) =>
          makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}: ${'y'.repeat(300)}`),
        ),
      ];
      const result = await compactor.compact(messages, 100);
      expect(result.messages[0].content).toBe(
        'Initial system context and instructions here',
      );
    });

    it('adds summary message with assistant role', async () => {
      const provider = createMockProvider('Key points discussed');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = Array.from({ length: 10 }, (_, i) =>
        makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}: ${'z'.repeat(400)}`),
      );
      const result = await compactor.compact(messages, 100);
      const summaryMsg = result.messages.find(
        (m) => typeof m.content === 'string' && m.content.includes('[Conversation Summary]'),
      );
      expect(summaryMsg).toBeDefined();
      expect(summaryMsg!.role).toBe('assistant');
    });

    it('returns empty summary when all messages fit in keep set', async () => {
      const provider = createMockProvider();
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = Array.from({ length: 5 }, (_, i) =>
        makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Short msg ${i}`),
      );
      const result = await compactor.compact(messages, 100000);
      expect(result.messages).toEqual(messages);
      expect(result.summary).toBe('');
    });
  });

  describe('generateSummary', () => {
    it('calls provider.complete with summary request', async () => {
      const provider = createMockProvider('Generated summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('user', 'What is testing?'),
        makeMsg('assistant', 'Testing verifies code works.'),
      ];
      const summary = await compactor.generateSummary(messages);
      expect(summary).toBe('Generated summary');
      expect(provider.complete).toHaveBeenCalledTimes(1);
      const callArg = (provider.complete as any).mock.calls[0][0];
      expect(callArg.messages[0].role).toBe('system');
      expect(callArg.messages[0].content).toContain('Summarize');
      expect(callArg.messages[1].role).toBe('user');
      expect(callArg.messages[1].content).toContain('What is testing?');
      expect(callArg.model).toBe('openai/gpt-4o-mini');
    });

    it('handles content as ContentPart[]', async () => {
      const provider = createMockProvider('Part content summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeTextContentMsg('user', 'Text part message'),
        makeTextContentMsg('assistant', 'Response with parts'),
      ];
      const summary = await compactor.generateSummary(messages);
      expect(summary).toBe('Part content summary');
      const callArg = (provider.complete as any).mock.calls[0][0];
      expect(callArg.messages[1].content).toContain('Text part message');
      expect(callArg.messages[1].content).toContain('Response with parts');
    });

    it('handles empty text parts gracefully', async () => {
      const provider = createMockProvider('Empty parts summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: undefined },
            { type: 'image_url', imageUrl: 'http://example.com/img.png' },
          ],
        },
      ];
      const summary = await compactor.generateSummary(messages);
      expect(summary).toBe('Empty parts summary');
    });

    it('handles response with ContentPart[] content', async () => {
      const provider = {
        complete: vi.fn().mockResolvedValue({
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Summary from parts' }],
          },
          usage: { inputTokens: 50, outputTokens: 25 },
          model: 'openai/gpt-4o-mini',
        }),
        type: 'openai' as const,
        name: 'mock',
      } as unknown as BaseProvider;
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('user', 'Test message'),
      ];
      const summary = await compactor.generateSummary(messages);
      expect(summary).toBe('Summary from parts');
    });
  });

  describe('token estimation', () => {
    it('estimates tokens from string content', async () => {
      const provider = createMockProvider();
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('user', 'x'.repeat(400)),
        makeMsg('assistant', 'y'.repeat(400)),
      ];
      const result = await compactor.compact(messages, 100000);
      expect(result.messages).toEqual(messages);
    });

    it('estimates tokens from ContentPart[] content', async () => {
      const provider = createMockProvider();
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeTextContentMsg('user', 'hello'),
        makeTextContentMsg('assistant', 'world'),
      ];
      const result = await compactor.compact(messages, 100000);
      expect(result.messages).toEqual(messages);
    });

    it('accounts for toolCalls in token estimation', async () => {
      const provider = createMockProvider('Tool summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('user', 'Do something'),
        ...Array.from({ length: 10 }, (_, i) =>
          makeMsg('assistant', 'x'.repeat(500), {
            toolCalls: [
              { id: `call-${i}`, name: 'read_file', arguments: '/path/to/file' },
            ],
          }),
        ),
      ];
      const result = await compactor.compact(messages, 50);
      expect(result.tokenSavings).toBeGreaterThan(0);
    });
  });

  describe('message selection', () => {
    it('keeps first message in compact result', async () => {
      const provider = createMockProvider('Summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = [
        makeMsg('system', 'You are a helpful assistant'),
        ...Array.from({ length: 12 }, (_, i) =>
          makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}: ${'a'.repeat(500)}`),
        ),
      ];
      const result = await compactor.compact(messages, 100);
      expect(result.messages[0].content).toBe('You are a helpful assistant');
    });

    it('preserves recent messages (last 20%)', async () => {
      const provider = createMockProvider('Summary');
      const compactor = new ConversationCompactor(provider);
      const messages: Message[] = Array.from({ length: 20 }, (_, i) =>
        makeMsg(i % 2 === 0 ? 'user' : 'assistant', `Message ${i}: ${'b'.repeat(500)}`),
      );
      const result = await compactor.compact(messages, 100);
      expect(result.messages.length).toBeGreaterThan(2);
    });
  });
});
