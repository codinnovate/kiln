import OpenAI from 'openai';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import type {
  CompletionRequest,
  CompletionResponse,
  Message,
  StreamChunk,
  ToolDefinition,
  ProviderType,
} from '../models/provider.js';
import { BaseProvider } from './base.js';

export class OpenAIProvider extends BaseProvider {
  readonly type: ProviderType = 'openai';
  readonly name: string = 'OpenAI';

  private client: OpenAI;

  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY || 'no-key',
      baseURL: baseUrl,
    });
  }

  validate(): boolean {
    return !!(this.apiKey || process.env.OPENAI_API_KEY);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.retryComplete(async () => {
      const response = await this.client.chat.completions.create({
        model: this.extractModelId(request.model),
        messages: this.formatMessages(request.messages) as ChatCompletionMessageParam[],
        tools: this.formatTools(request.tools) as ChatCompletionTool[] | undefined,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response choices returned');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: choice.message.content ?? '',
      };

      if (choice.message.tool_calls?.length) {
        assistantMessage.toolCalls = choice.message.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }));
      }

      return {
        message: assistantMessage,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        model: request.model,
      };
    });
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    yield* this.streamWithRetry(() => this._rawStream(request));
  }

  protected async *_rawStream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.extractModelId(request.model),
      messages: this.formatMessages(request.messages) as ChatCompletionMessageParam[],
      tools: this.formatTools(request.tools) as ChatCompletionTool[] | undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

    const toolCallAccumulator: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: 'text_delta', text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          const existing = toolCallAccumulator.get(index);

          if (!existing && tc.id) {
            toolCallAccumulator.set(index, {
              id: tc.id,
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          } else if (existing) {
            if (tc.function?.name) {
              existing.name += tc.function.name;
            }
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          }
        }
      }

      if (chunk.usage) {
        yield {
          type: 'usage',
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    for (const [, tc] of toolCallAccumulator) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        },
      };
    }

    yield { type: 'done' };
  }

  protected formatMessages(messages: Message[]): ChatCompletionMessageParam[] {
    const formatted: ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case 'system': {
          formatted.push({
            role: 'system',
            content: this.extractTextContent(msg.content),
          });
          break;
        }
        case 'user': {
          const content = this.formatUserContent(msg.content);
          formatted.push({ role: 'user', content });
          break;
        }
        case 'assistant': {
          const toolCalls = msg.toolCalls?.length
            ? msg.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              }))
            : undefined;
          const assistantMsg: ChatCompletionAssistantMessageParam = {
            role: 'assistant',
            content: this.extractTextContent(msg.content),
            tool_calls: toolCalls,
          };
          formatted.push(assistantMsg);
          break;
        }
        case 'tool': {
          const toolResults = this.extractToolResults(msg.content);
          for (const tr of toolResults) {
            formatted.push({
              role: 'tool',
              tool_call_id: tr.toolCallId,
              content: tr.content,
            });
          }
          break;
        }
      }
    }

    return formatted;
  }

  protected formatTools(
    tools?: ToolDefinition[],
  ): ChatCompletionTool[] | undefined {
    if (!tools?.length) return undefined;

    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private extractTextContent(content: string | import('../models/provider.js').ContentPart[]): string {
    if (typeof content === 'string') return content;
    const textParts = content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!);
    return textParts.join('');
  }

  private formatUserContent(
    content: string | import('../models/provider.js').ContentPart[],
  ): string | import('openai/resources/chat/completions.js').ChatCompletionContentPart[] {
    if (typeof content === 'string') return content;

    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text' as const, text: part.text ?? '' };
      }
      if (part.type === 'image_url' && part.imageUrl) {
        return {
          type: 'image_url' as const,
          image_url: { url: part.imageUrl },
        };
      }
      return { type: 'text' as const, text: '' };
    });
  }

  private extractToolResults(
    content: string | import('../models/provider.js').ContentPart[],
  ): import('../models/provider.js').ToolResult[] {
    if (typeof content === 'string') {
      return [{ toolCallId: '', content, isError: false }];
    }
    return content
      .filter((p) => p.type === 'tool_result' && p.toolResult)
      .map((p) => p.toolResult!);
  }
}
