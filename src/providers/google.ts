import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  Content,
  FunctionDeclaration,
  Part,
  GenerateContentRequest,
} from '@google/generative-ai';
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

export class GoogleProvider extends BaseProvider {
  readonly type: ProviderType = 'google';
  readonly name: string = 'Google';

  private genAI: GoogleGenerativeAI;

  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey, baseUrl);
    this.genAI = new GoogleGenerativeAI(
      apiKey || process.env.GOOGLE_API_KEY || '',
    );
    if (baseUrl) {
      void baseUrl;
    }
  }

  validate(): boolean {
    return !!(this.apiKey || process.env.GOOGLE_API_KEY);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const { systemInstruction, contents } = this.buildRequest(request);

      const model = this.genAI.getGenerativeModel({
        model: this.extractModelId(request.model),
        systemInstruction: systemInstruction || undefined,
      });

      const generateRequest: GenerateContentRequest = {
        contents,
        tools: this.formatTools(request.tools) as
          | { functionDeclarations: FunctionDeclaration[] }[]
          | undefined,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        },
      };

      const result = await model.generateContent(generateRequest);
      const response = result.response;

      const textParts: string[] = [];
      const functionCalls: import('../models/provider.js').ToolCall[] = [];

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) {
          textParts.push(part.text);
        }
        if (part.functionCall) {
          functionCalls.push({
            id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args),
          });
        }
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: textParts.join(''),
      };

      if (functionCalls.length) {
        assistantMessage.toolCalls = functionCalls;
      }

      const usage = response.usageMetadata;

      return {
        message: assistantMessage,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
        },
        model: request.model,
      };
    } catch (error) {
      this.createErrorResponse(error);
    }
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamChunk> {
    try {
      const { systemInstruction, contents } = this.buildRequest(request);

      const model = this.genAI.getGenerativeModel({
        model: this.extractModelId(request.model),
        systemInstruction: systemInstruction || undefined,
      });

      const generateRequest: GenerateContentRequest = {
        contents,
        tools: this.formatTools(request.tools) as
          | { functionDeclarations: FunctionDeclaration[] }[]
          | undefined,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
        },
      };

      const result = await model.generateContentStream(generateRequest);

      const functionCalls: import('../models/provider.js').ToolCall[] = [];

      for await (const chunk of result.stream) {
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];

        for (const part of parts) {
          if (part.text) {
            yield { type: 'text_delta', text: part.text };
          }
          if (part.functionCall) {
            functionCalls.push({
              id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            });
          }
        }

        const usage = chunk.usageMetadata;
        if (usage) {
          yield {
            type: 'usage',
            inputTokens: usage.promptTokenCount ?? 0,
            outputTokens: usage.candidatesTokenCount ?? 0,
          };
        }
      }

      for (const fc of functionCalls) {
        yield { type: 'tool_call', toolCall: fc };
      }

      yield { type: 'done' };
    } catch (error) {
      yield { type: 'error', error: error instanceof Error ? error.message : String(error) };
    }
  }

  protected formatMessages(messages: Message[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = this.buildParts(msg);

      if (parts.length) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  protected formatTools(
    tools?: ToolDefinition[],
  ): { functionDeclarations: FunctionDeclaration[] }[] | undefined {
    if (!tools?.length) return undefined;

    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as unknown as FunctionDeclaration['parameters'],
        })),
      },
    ];
  }

  private buildRequest(
    request: CompletionRequest,
  ): { systemInstruction: string; contents: Content[] } {
    const systemParts: string[] = [];
    const nonSystem: Message[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemParts.push(this.extractText(msg.content));
      } else {
        nonSystem.push(msg);
      }
    }

    return {
      systemInstruction: systemParts.join('\n\n'),
      contents: this.formatMessages(nonSystem) as Content[],
    };
  }

  private buildParts(msg: Message): Part[] {
    const parts: Part[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text });
        }
        if (part.type === 'image_url' && part.imageUrl) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: '',
            },
          } as Part);
        }
      }
    }

    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = { raw: tc.arguments };
        }
        parts.push({
          functionCall: {
            name: tc.name,
            args,
          },
        } as Part);
      }
    }

    return parts;
  }

  private extractText(content: string | ContentPart[]): string {
    if (typeof content === 'string') return content;
    return content
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!)
      .join('');
  }
}
