import type {
  CompletionRequest,
  CompletionResponse,
  Message,
  StreamChunk,
  ToolDefinition,
  ProviderType,
} from '../models/provider.js';
import { getModel } from '../models/registry.js';
import {
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  calculateBackoff,
  sleep,
} from './retry.js';

export abstract class BaseProvider {
  abstract readonly type: ProviderType;
  abstract readonly name: string;

  protected apiKey?: string;
  protected baseUrl?: string;
  protected retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG };
  protected onRetry?: (attempt: number, maxAttempts: number, error: string) => void;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract stream(request: CompletionRequest): AsyncGenerator<StreamChunk>;

  setMaxRetries(maxRetries: number): void {
    this.retryConfig = { ...this.retryConfig, maxRetries };
  }

  setOnRetry(callback: (attempt: number, maxAttempts: number, error: string) => void): void {
    this.onRetry = callback;
  }

  validate(): boolean {
    return !!this.apiKey;
  }

  protected async retryComplete(
    fn: () => Promise<CompletionResponse>,
  ): Promise<CompletionResponse> {
    const max = this.retryConfig.maxRetries;
    let lastError: unknown;

    for (let attempt = 0; attempt <= max; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) || attempt === max) {
          throw error;
        }
        const delay = calculateBackoff(attempt, this.retryConfig);
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.onRetry?.(attempt + 1, max, errorMsg);
        await sleep(delay);
      }
    }
    throw lastError;
  }

  protected async *streamWithRetry(
    createStream: () => AsyncGenerator<StreamChunk>,
  ): AsyncGenerator<StreamChunk> {
    const max = this.retryConfig.maxRetries;

    for (let attempt = 0; attempt <= max; attempt++) {
      let hasRetryableError = false;
      let retryError: unknown;

      for await (const chunk of createStream()) {
        if (chunk.type === 'error' && isRetryableError(new Error(chunk.error))) {
          hasRetryableError = true;
          retryError = new Error(chunk.error);
          break;
        }
        yield chunk;
      }

      if (!hasRetryableError) {
        return;
      }

      if (attempt < max) {
        const errorMsg = retryError instanceof Error ? retryError.message : String(retryError);
        this.onRetry?.(attempt + 1, max, errorMsg);
        const delay = calculateBackoff(attempt, this.retryConfig);
        await sleep(delay);
      } else {
        const errorMsg = retryError instanceof Error ? retryError.message : String(retryError);
        yield { type: 'error', error: errorMsg };
      }
    }
  }

  protected abstract formatMessages(messages: Message[]): unknown[];
  protected abstract formatTools(tools?: ToolDefinition[]): unknown[] | undefined;

  protected extractModelId(model: string): string {
    const modelInfo = getModel(model);
    if (modelInfo) {
      return modelInfo.id.split('/').slice(1).join('/');
    }
    const slashIndex = model.indexOf('/');
    if (slashIndex !== -1) {
      return model.slice(slashIndex + 1);
    }
    return model;
  }

  protected resolveModelProvider(model: string): ProviderType | undefined {
    const modelInfo = getModel(model);
    return modelInfo?.provider;
  }

  protected createErrorResponse(error: unknown): never {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('rate limit') || msg.includes('429')) {
        throw new ProviderError(
          `Rate limit exceeded for ${this.name}`,
          'RATE_LIMIT',
          this.type,
        );
      }
      if (msg.includes('unauthorized') || msg.includes('401') || msg.includes('invalid api key')) {
        throw new ProviderError(
          `Invalid API key for ${this.name}`,
          'AUTH',
          this.type,
        );
      }
      if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('402')) {
        throw new ProviderError(
          `Quota exceeded for ${this.name}`,
          'QUOTA',
          this.type,
        );
      }
      if (msg.includes('timeout') || msg.includes('econnrefused')) {
        throw new ProviderError(
          `Connection error for ${this.name}: ${error.message}`,
          'CONNECTION',
          this.type,
        );
      }
      throw new ProviderError(
        `${this.name} error: ${error.message}`,
        'UNKNOWN',
        this.type,
      );
    }
    throw new ProviderError(
      `Unknown error from ${this.name}`,
      'UNKNOWN',
      this.type,
    );
  }
}

export class ProviderError extends Error {
  readonly code: string;
  readonly provider: ProviderType;

  constructor(message: string, code: string, provider: ProviderType) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.provider = provider;
  }
}
