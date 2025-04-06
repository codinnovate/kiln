import type { Message } from '../models/provider.js';
import type { BaseProvider } from '../providers/base.js';

export interface CompactionResult {
  messages: Message[];
  summary: string;
  tokenSavings: number;
}

const CHARS_PER_TOKEN = 4;

export class ConversationCompactor {
  private provider: BaseProvider;

  constructor(provider: BaseProvider) {
    this.provider = provider;
  }

  async compact(
    messages: Message[],
    targetTokens: number,
  ): Promise<CompactionResult> {
    const originalTokens = this.estimateTokens(messages);

    if (originalTokens <= targetTokens) {
      return {
        messages,
        summary: '',
        tokenSavings: 0,
      };
    }

    const { keep, compact } = this.selectMessagesToCompact(messages);

    if (compact.length === 0) {
      return {
        messages,
        summary: '',
        tokenSavings: 0,
      };
    }

    const summary = await this.generateSummary(compact);

    const summaryMessage: Message = {
      role: 'assistant',
      content: `[Conversation Summary]\n${summary}`,
    };

    const compacted = [...keep, summaryMessage];
    const newTokens = this.estimateTokens(compacted);

    return {
      messages: compacted,
      summary,
      tokenSavings: originalTokens - newTokens,
    };
  }

  private selectMessagesToCompact(messages: Message[]): {
    keep: Message[];
    compact: Message[];
  } {
    if (messages.length <= 6) {
      return { keep: messages, compact: [] };
    }

    const keepCount = Math.max(4, Math.floor(messages.length * 0.2));
    const recentStart = messages.length - keepCount;

    const keep: Message[] = messages.slice(0, 1);
    const compact: Message[] = messages.slice(1, recentStart);
    const recent = messages.slice(recentStart);

    for (const msg of recent) {
      if (
        msg.role === 'tool' ||
        msg.toolCallId ||
        (msg.toolCalls && msg.toolCalls.length > 0)
      ) {
        keep.push(msg);
      } else {
        keep.push(msg);
      }
    }

    return { keep, compact };
  }

  async generateSummary(messages: Message[]): Promise<string> {
    const conversationText = messages
      .map((m) => {
        const content =
          typeof m.content === 'string'
            ? m.content
            : m.content
                .filter((p) => p.type === 'text')
                .map((p) => p.text ?? '')
                .join('');
        return `${m.role}: ${content}`;
      })
      .join('\n');

    const summaryRequest = {
      messages: [
        {
          role: 'system' as const,
          content:
            'Summarize the following conversation concisely, preserving key context, decisions, and facts. Keep it under 200 words.',
        },
        {
          role: 'user' as const,
          content: conversationText,
        },
      ],
      model: 'openai/gpt-4o-mini',
    };

    const response = await this.provider.complete(summaryRequest);
    const content =
      typeof response.message.content === 'string'
        ? response.message.content
        : response.message.content
            .filter((p) => p.type === 'text')
            .map((p) => p.text ?? '')
            .join('');

    return content;
  }

  private estimateTokens(messages: Message[]): number {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            totalChars += part.text.length;
          }
        }
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          totalChars += tc.arguments.length + tc.name.length;
        }
      }
    }
    return Math.ceil(totalChars / CHARS_PER_TOKEN);
  }
}
