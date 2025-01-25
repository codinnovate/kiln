import OpenAI from 'openai';
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderType,
  StreamChunk,
  ToolDefinition,
} from '../models/provider.js';
import { OpenAIProvider } from './openai.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider extends OpenAIProvider {
  readonly type: ProviderType = 'openrouter';
  readonly name: string = 'OpenRouter';

  private openrouterClient: OpenAI;
  private referer?: string;
  private title?: string;

  constructor(
    apiKey?: string,
    baseUrl?: string,
    options?: { referer?: string; title?: string },
  ) {
    super(apiKey, baseUrl);
    this.referer = options?.referer;
    this.title = options?.title ?? 'Kiln';

    this.openrouterClient = new OpenAI({
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      baseURL: baseUrl || OPENROUTER_BASE_URL,
      defaultHeaders: {
        ...(this.referer ? { 'HTTP-Referer': this.referer } : {}),
        'X-Title': this.title,
      },
    });
  }

  validate(): boolean {
    return !!(this.apiKey || process.env.OPENROUTER_API_KEY);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.openrouterClient.chat.completions.create({
        model: this.mapModelId(request.model),
        messages: this.formatMessages(request.messages) as OpenAI.ChatCompletionMessageParam[],
        tools: this.formatTools(request.tools) as OpenAI.ChatCompletionTool[] | undefined,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response choices returned');
      }

      const assistantMessage: import('../models/provider.js').Message = {
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
    } catch (error) {
      this.createErrorResponse(error);
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const stream = await this.openrouterClient.chat.completions.create({
        model: this.mapModelId(request.model),
        messages: this.formatMessages(request.messages) as OpenAI.ChatCompletionMessageParam[],
        tools: this.formatTools(request.tools) as OpenAI.ChatCompletionTool[] | undefined,
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
    } catch (error) {
      yield { type: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }

  protected formatTools(
    tools?: ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] | undefined {
    return super.formatTools(tools) as OpenAI.ChatCompletionTool[] | undefined;
  }

  private mapModelId(model: string): string {
    const modelId = this.extractModelId(model);

    const providerPrefixes = ['openai/', 'anthropic/', 'google/', 'meta-llama/', 'mistralai/', 'deepseek/'];
    for (const prefix of providerPrefixes) {
      if (modelId.startsWith(prefix)) {
        return modelId;
      }
    }

    return modelId;
  }
}
