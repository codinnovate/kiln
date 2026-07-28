import OpenAI from 'openai';
import type {
  CompletionRequest,
  CompletionResponse,
  ProviderType,
  StreamChunk,
  ToolDefinition,
} from '../models/provider.js';
import { OpenAIProvider } from './openai.js';

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

export class OllamaProvider extends OpenAIProvider {
  readonly type: ProviderType = 'ollama';
  readonly name: string = 'Ollama';

  private ollamaClient: OpenAI;

  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
    this.ollamaClient = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${baseUrl || OLLAMA_DEFAULT_BASE_URL}/v1`,
    });
  }

  validate(): boolean {
    return true;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    return this.retryComplete(async () => {
      const response = await this.ollamaClient.chat.completions.create({
        model: this.extractModelId(request.model),
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
    });
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    yield* this.streamWithRetry(() => this._rawStream(request));
  }

  protected override async *_rawStream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    const stream = await this.ollamaClient.chat.completions.create({
      model: this.extractModelId(request.model),
      messages: this.formatMessages(request.messages) as OpenAI.ChatCompletionMessageParam[],
      tools: this.formatTools(request.tools) as OpenAI.ChatCompletionTool[] | undefined,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
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

  protected formatTools(
    tools?: ToolDefinition[],
  ): OpenAI.ChatCompletionTool[] | undefined {
    return super.formatTools(tools) as OpenAI.ChatCompletionTool[] | undefined;
  }
}
