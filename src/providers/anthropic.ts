import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import type {
  CompletionRequest,
  CompletionResponse,
  ContentPart,
  Message,
  ProviderType,
  StreamChunk,
  ToolDefinition,
} from '../models/provider.js';
import { BaseProvider } from './base.js';

export class AnthropicProvider extends BaseProvider {
  readonly type: ProviderType = 'anthropic';
  readonly name: string = 'Anthropic';

  private client: Anthropic;

  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: baseUrl,
    });
  }

  validate(): boolean {
    return !!(this.apiKey || process.env.ANTHROPIC_API_KEY);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.retryComplete(async () => {
      const { system, messages } = this.splitSystemMessages(request.messages);

      const response = await this.client.messages.create({
        model: this.extractModelId(request.model),
        max_tokens: request.maxTokens ?? 8192,
        system: system || undefined,
        messages: this.formatMessages(messages) as MessageParam[],
        tools: this.formatTools(request.tools) as Tool[] | undefined,
        temperature: request.temperature,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
      };

      const textParts: string[] = [];
      const toolCalls: import('../models/provider.js').ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
          });
        }
      }

      assistantMessage.content = textParts.join('');
      if (toolCalls.length) {
        assistantMessage.toolCalls = toolCalls;
      }

      return {
        message: assistantMessage,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        model: request.model,
      };
    });
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    yield* this.streamWithRetry(() => this._rawStream(request));
  }

  private async *_rawStream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const { system, messages } = this.splitSystemMessages(request.messages);

    const stream = this.client.messages.stream({
      model: this.extractModelId(request.model),
      max_tokens: request.maxTokens ?? 8192,
      system: system || undefined,
      messages: this.formatMessages(messages) as MessageParam[],
      tools: this.formatTools(request.tools) as Tool[] | undefined,
      temperature: request.temperature,
    });

    const toolCallBlocks: ToolUseBlock[] = [];

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCallBlocks.push(event.content_block as ToolUseBlock);
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          const block = toolCallBlocks.find(
            (b) => b.id === (event as unknown as { content_block: { id: string } }).content_block?.id,
          );
          if (block) {
            (block as unknown as { input: string }).input =
              ((block as unknown as { input: string }).input ?? '') +
              event.delta.partial_json;
          }
        }
      } else if (event.type === 'message_delta') {
        if ('usage' in event && event.usage) {
          yield {
            type: 'usage',
            inputTokens: 0,
            outputTokens: event.usage.output_tokens ?? 0,
          };
        }
      }
    }

    const finalMessage = await stream.finalMessage();

    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        yield {
          type: 'tool_call',
          toolCall: {
            id: block.id,
            name: block.name,
            arguments:
              typeof block.input === 'string'
                ? block.input
                : JSON.stringify(block.input),
          },
        };
      }
    }

    yield { type: 'done' };
  }

  protected formatMessages(messages: Message[]): MessageParam[] {
    const formatted: MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      if (msg.role === 'user') {
        formatted.push({
          role: 'user',
          content: this.formatContentBlocks(msg.content),
        });
      } else if (msg.role === 'assistant') {
        const blocks: (TextBlock | ToolUseBlock)[] = [];

        const text = this.extractText(msg.content);
        if (text) {
          blocks.push({ type: 'text', text } as TextBlock);
        }

        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            let input: Record<string, unknown> = {};
            try {
              input = JSON.parse(tc.arguments);
            } catch {
              input = { raw: tc.arguments };
            }
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input,
            } as ToolUseBlock);
          }
        }

        formatted.push({ role: 'assistant', content: blocks });
      } else if (msg.role === 'tool') {
        const results = this.extractToolResults(msg.content);
        formatted.push({
          role: 'user',
          content: results.map((tr) => ({
            type: 'tool_result' as const,
            tool_use_id: tr.toolCallId,
            content: tr.content,
            is_error: tr.isError,
          })),
        });
      }
    }

    return formatted;
  }

  protected formatTools(tools?: ToolDefinition[]): Tool[] | undefined {
    if (!tools?.length) return undefined;

    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Tool['input_schema'],
    }));
  }

  private splitSystemMessages(
    messages: Message[],
  ): { system: string; messages: Message[] } {
    const systemParts: string[] = [];
    const nonSystem: Message[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(this.extractText(msg.content));
      } else {
        nonSystem.push(msg);
      }
    }

    return {
      system: systemParts.join('\n\n'),
      messages: nonSystem,
    };
  }

  private formatContentBlocks(
    content: string | ContentPart[],
  ): string | Anthropic.ContentBlockParam[] {
    if (typeof content === 'string') return content;

    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text ?? '' };
      }
      if (part.type === 'image_url' && part.imageUrl) {
        return {
          type: 'image' as const,
          source: {
            type: 'url' as const,
            url: part.imageUrl,
          },
        };
      }
      return { type: 'text' as const, text: '' };
    });
  }

  private extractText(content: string | ContentPart[]): string {
    if (typeof content === 'string') return content;
    return content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!)
      .join('');
  }

  private extractToolResults(
    content: string | ContentPart[],
  ): import('../models/provider.js').ToolResult[] {
    if (typeof content === 'string') {
      return [{ toolCallId: '', content, isError: false }];
    }
    return content
      .filter((p) => p.type === 'tool_result' && p.toolResult)
      .map((p) => p.toolResult!);
  }
}
