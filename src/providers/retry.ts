import { ProviderError } from './base.js';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
};

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    switch (error.code) {
      case 'RATE_LIMIT':
      case 'CONNECTION':
        return true;
      case 'UNKNOWN':
        return false;
      default:
        return false;
    }
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) {
      return true;
    }
    if (msg.includes('429') || msg.includes('rate limit')) {
      return true;
    }
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return true;
    }
    if (msg.includes('overloaded') || msg.includes('temporarily unavailable')) {
      return true;
    }
  }

  return false;
}

export function calculateBackoff(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.5 * config.baseDelay;
  return Math.min(delay + jitter, config.maxDelay);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
