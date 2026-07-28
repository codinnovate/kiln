import { describe, it, expect, vi } from 'vitest';
import { createProvider, ProviderError, OpenAIProvider, AnthropicProvider } from '../../src/providers/index.js';

describe('createProvider', () => {
  it('creates an OpenAI provider', () => {
    const provider = createProvider('openai', 'sk-test');
    expect(provider.type).toBe('openai');
    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect(provider.validate()).toBe(true);
  });

  it('creates an Anthropic provider', () => {
    const provider = createProvider('anthropic', 'sk-ant-test');
    expect(provider.type).toBe('anthropic');
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.validate()).toBe(true);
  });

  it('creates provider without API key', () => {
    const provider = createProvider('anthropic');
    expect(provider.type).toBe('anthropic');
    expect(provider.validate()).toBe(false);
  });

  it('creates provider with baseUrl', () => {
    const provider = createProvider('anthropic', 'sk-test', 'https://custom.api.com');
    expect(provider.type).toBe('anthropic');
    expect(provider.validate()).toBe(true);
  });

  it('throws for unknown provider type', () => {
    expect(() => createProvider('unknown' as any)).toThrow(ProviderError);
  });

  it('ProviderError has correct properties', () => {
    try {
      createProvider('unknown' as any);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe('UNKNOWN_PROVIDER');
      expect((error as ProviderError).message).toContain('Unknown provider');
    }
  });
});

describe('BaseProvider retry configuration', () => {
  it('provider has setMaxRetries method', () => {
    const provider = createProvider('anthropic', 'sk-test');
    expect(typeof provider.setMaxRetries).toBe('function');
  });

  it('provider has setOnRetry method', () => {
    const provider = createProvider('anthropic', 'sk-test');
    expect(typeof provider.setOnRetry).toBe('function');
  });

  it('provider has validate method', () => {
    const provider = createProvider('anthropic', 'sk-test');
    expect(typeof provider.validate).toBe('function');
  });

  it('setMaxRetries does not throw', () => {
    const provider = createProvider('anthropic', 'sk-test');
    expect(() => provider.setMaxRetries(5)).not.toThrow();
  });

  it('setOnRetry does not throw', () => {
    const provider = createProvider('anthropic', 'sk-test');
    expect(() => provider.setOnRetry(() => {})).not.toThrow();
  });
});
