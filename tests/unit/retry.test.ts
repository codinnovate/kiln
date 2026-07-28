import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRetryableError,
  calculateBackoff,
  sleep,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from '../../src/providers/retry.js';
import { ProviderError } from '../../src/providers/base.js';

describe('isRetryableError', () => {
  describe('ProviderError', () => {
    it('returns true for RATE_LIMIT code', () => {
      const error = new ProviderError('Rate limited', 'RATE_LIMIT', 'openai');
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns true for CONNECTION code', () => {
      const error = new ProviderError('Connection lost', 'CONNECTION', 'anthropic');
      expect(isRetryableError(error)).toBe(true);
    });

    it('returns false for UNKNOWN code', () => {
      const error = new ProviderError('Unknown error', 'UNKNOWN', 'openai');
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns false for AUTH code', () => {
      const error = new ProviderError('Invalid key', 'AUTH', 'openai');
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns false for QUOTA code', () => {
      const error = new ProviderError('Out of credits', 'QUOTA', 'openai');
      expect(isRetryableError(error)).toBe(false);
    });

    it('returns false for any unrecognized code', () => {
      const error = new ProviderError('Something', 'CUSTOM_CODE', 'google');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('Error with retryable messages', () => {
    it('returns true for timeout message', () => {
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    });

    it('returns true for ECONNRESET', () => {
      expect(isRetryableError(new Error('read ECONNRESET'))).toBe(true);
    });

    it('returns true for ECONNREFUSED', () => {
      expect(isRetryableError(new Error('connect ECONNREFUSED'))).toBe(true);
    });

    it('returns true for 429 status', () => {
      expect(isRetryableError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
    });

    it('returns true for rate limit message', () => {
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
    });

    it('returns true for 500 error', () => {
      expect(isRetryableError(new Error('Internal Server Error 500'))).toBe(true);
    });

    it('returns true for 502 error', () => {
      expect(isRetryableError(new Error('Bad Gateway 502'))).toBe(true);
    });

    it('returns true for 503 error', () => {
      expect(isRetryableError(new Error('Service Unavailable 503'))).toBe(true);
    });

    it('returns true for 504 error', () => {
      expect(isRetryableError(new Error('Gateway Timeout 504'))).toBe(true);
    });

    it('returns true for overloaded message', () => {
      expect(isRetryableError(new Error('Server is overloaded'))).toBe(true);
    });

    it('returns true for temporarily unavailable', () => {
      expect(isRetryableError(new Error('Service temporarily unavailable'))).toBe(true);
    });
  });

  describe('Error with non-retryable messages', () => {
    it('returns false for generic error', () => {
      expect(isRetryableError(new Error('Something went wrong'))).toBe(false);
    });

    it('returns false for 400 Bad Request', () => {
      expect(isRetryableError(new Error('400 Bad Request'))).toBe(false);
    });

    it('returns false for 401 Unauthorized', () => {
      expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
    });

    it('returns false for 404 Not Found', () => {
      expect(isRetryableError(new Error('404 Not Found'))).toBe(false);
    });

    it('returns false for file not found', () => {
      expect(isRetryableError(new Error('ENOENT: no such file'))).toBe(false);
    });
  });

  describe('non-Error values', () => {
    it('returns false for string', () => {
      expect(isRetryableError('some string')).toBe(false);
    });

    it('returns false for number', () => {
      expect(isRetryableError(42)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isRetryableError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isRetryableError(undefined)).toBe(false);
    });

    it('returns false for plain object', () => {
      expect(isRetryableError({ message: 'timeout' })).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('matches TIMEOUT in uppercase', () => {
      expect(isRetryableError(new Error('TIMEOUT occurred'))).toBe(true);
    });

    it('matches Rate Limit mixed case', () => {
      expect(isRetryableError(new Error('Rate Limit'))).toBe(true);
    });

    it('matches Overloaded capitalized', () => {
      expect(isRetryableError(new Error('Server Overloaded'))).toBe(true);
    });
  });
});

describe('calculateBackoff', () => {
  const config: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
  };

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns at least baseDelay * 2^attempt', () => {
    const result = calculateBackoff(0, config);
    expect(result).toBeGreaterThanOrEqual(1000);
  });

  it('increases with attempt number', () => {
    const result0 = calculateBackoff(0, config);
    const result1 = calculateBackoff(1, config);
    const result2 = calculateBackoff(2, config);
    expect(result2).toBeGreaterThan(result1);
    expect(result1).toBeGreaterThan(result0);
  });

  it('caps at maxDelay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1.0);
    const result = calculateBackoff(10, config);
    expect(result).toBeLessThanOrEqual(config.maxDelay);
  });

  it('adds jitter based on random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const resultNoJitter = calculateBackoff(0, config);
    // baseDelay * 2^0 + 0 = 1000
    expect(resultNoJitter).toBe(1000);

    vi.spyOn(Math, 'random').mockReturnValue(1.0);
    const resultMaxJitter = calculateBackoff(0, config);
    // baseDelay * 2^0 + 0.5 * 1000 = 1500
    expect(resultMaxJitter).toBe(1500);
  });

  it('calculates correct backoff for attempt 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateBackoff(0, config)).toBe(1000);
  });

  it('calculates correct backoff for attempt 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateBackoff(1, config)).toBe(2000);
  });

  it('calculates correct backoff for attempt 2', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(calculateBackoff(2, config)).toBe(4000);
  });

  it('respects maxDelay with small baseDelay', () => {
    const smallConfig: RetryConfig = {
      maxRetries: 10,
      baseDelay: 100,
      maxDelay: 500,
    };
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = calculateBackoff(10, smallConfig);
    expect(result).toBe(500);
  });
});

describe('sleep', () => {
  it('resolves after specified time', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  it('resolves for zero ms', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});

describe('DEFAULT_RETRY_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3);
    expect(DEFAULT_RETRY_CONFIG.baseDelay).toBe(1000);
    expect(DEFAULT_RETRY_CONFIG.maxDelay).toBe(30000);
  });

  it('maxRetries is non-negative', () => {
    expect(DEFAULT_RETRY_CONFIG.maxRetries).toBeGreaterThanOrEqual(0);
  });

  it('baseDelay is positive', () => {
    expect(DEFAULT_RETRY_CONFIG.baseDelay).toBeGreaterThan(0);
  });

  it('maxDelay is >= baseDelay', () => {
    expect(DEFAULT_RETRY_CONFIG.maxDelay).toBeGreaterThanOrEqual(DEFAULT_RETRY_CONFIG.baseDelay);
  });
});
