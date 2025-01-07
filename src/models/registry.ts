import type { ModelInfo, ProviderType } from './provider.js';
import { resolveModelAlias } from './aliases.js';

const models: Map<string, ModelInfo> = new Map();

function register(model: ModelInfo): void {
  models.set(model.id, model);
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

register({
  id: 'openai/gpt-4o',
  name: 'GPT-4o',
  provider: 'openai',
  contextWindow: 128_000,
  maxOutput: 16_384,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 2.5 / 1_000_000,
  costPerOutputToken: 10 / 1_000_000,
});

register({
  id: 'openai/gpt-4o-mini',
  name: 'GPT-4o Mini',
  provider: 'openai',
  contextWindow: 128_000,
  maxOutput: 16_384,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 0.15 / 1_000_000,
  costPerOutputToken: 0.6 / 1_000_000,
});

register({
  id: 'openai/gpt-4.1',
  name: 'GPT-4.1',
  provider: 'openai',
  contextWindow: 1_048_576,
  maxOutput: 32_768,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 2 / 1_000_000,
  costPerOutputToken: 8 / 1_000_000,
});

register({
  id: 'openai/gpt-4.1-mini',
  name: 'GPT-4.1 Mini',
  provider: 'openai',
  contextWindow: 1_048_576,
  maxOutput: 32_768,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 0.4 / 1_000_000,
  costPerOutputToken: 1.6 / 1_000_000,
});

register({
  id: 'openai/gpt-4.1-nano',
  name: 'GPT-4.1 Nano',
  provider: 'openai',
  contextWindow: 1_048_576,
  maxOutput: 32_768,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 0.1 / 1_000_000,
  costPerOutputToken: 0.4 / 1_000_000,
});

register({
  id: 'openai/o3',
  name: 'o3',
  provider: 'openai',
  contextWindow: 200_000,
  maxOutput: 100_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 10 / 1_000_000,
  costPerOutputToken: 40 / 1_000_000,
});

register({
  id: 'openai/o4-mini',
  name: 'o4-mini',
  provider: 'openai',
  contextWindow: 200_000,
  maxOutput: 100_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 1.1 / 1_000_000,
  costPerOutputToken: 4.4 / 1_000_000,
});

register({
  id: 'openai/gpt-5',
  name: 'GPT-5',
  provider: 'openai',
  contextWindow: 400_000,
  maxOutput: 100_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 2.5 / 1_000_000,
  costPerOutputToken: 10 / 1_000_000,
});

register({
  id: 'openai/gpt-5-mini',
  name: 'GPT-5 Mini',
  provider: 'openai',
  contextWindow: 400_000,
  maxOutput: 100_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 1.25 / 1_000_000,
  costPerOutputToken: 5 / 1_000_000,
});

register({
  id: 'openai/gpt-5-nano',
  name: 'GPT-5 Nano',
  provider: 'openai',
  contextWindow: 400_000,
  maxOutput: 100_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 0.5 / 1_000_000,
  costPerOutputToken: 2 / 1_000_000,
});

// ── Anthropic ───────────────────────────────────────────────────────────────

register({
  id: 'anthropic/claude-sonnet-4-20250514',
  name: 'Claude Sonnet 4',
  provider: 'anthropic',
  contextWindow: 200_000,
  maxOutput: 16_384,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 3 / 1_000_000,
  costPerOutputToken: 15 / 1_000_000,
});

register({
  id: 'anthropic/claude-opus-4-20250514',
  name: 'Claude Opus 4',
  provider: 'anthropic',
  contextWindow: 200_000,
  maxOutput: 32_000,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 15 / 1_000_000,
  costPerOutputToken: 75 / 1_000_000,
});

register({
  id: 'anthropic/claude-3-5-haiku-20241022',
  name: 'Claude 3.5 Haiku',
  provider: 'anthropic',
  contextWindow: 200_000,
  maxOutput: 8_192,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 0.8 / 1_000_000,
  costPerOutputToken: 4 / 1_000_000,
});

register({
  id: 'anthropic/claude-3-7-sonnet-20250219',
  name: 'Claude 3.7 Sonnet',
  provider: 'anthropic',
  contextWindow: 200_000,
  maxOutput: 16_384,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 3 / 1_000_000,
  costPerOutputToken: 15 / 1_000_000,
});

// ── Google ──────────────────────────────────────────────────────────────────

register({
  id: 'google/gemini-2.5-pro',
  name: 'Gemini 2.5 Pro',
  provider: 'google',
  contextWindow: 1_048_576,
  maxOutput: 65_536,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 1.25 / 1_000_000,
  costPerOutputToken: 10 / 1_000_000,
});

register({
  id: 'google/gemini-2.5-flash',
  name: 'Gemini 2.5 Flash',
  provider: 'google',
  contextWindow: 1_048_576,
  maxOutput: 65_536,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: true,
  costPerInputToken: 0.15 / 1_000_000,
  costPerOutputToken: 0.6 / 1_000_000,
});

register({
  id: 'google/gemini-2.0-flash',
  name: 'Gemini 2.0 Flash',
  provider: 'google',
  contextWindow: 1_048_576,
  maxOutput: 8_192,
  supportsTools: true,
  supportsStreaming: true,
  supportsReasoning: false,
  costPerInputToken: 0.1 / 1_000_000,
  costPerOutputToken: 0.4 / 1_000_000,
});

// ── Public API ──────────────────────────────────────────────────────────────

export function getModel(id: string): ModelInfo | undefined {
  return models.get(id);
}

export function getModelByAlias(alias: string): ModelInfo | undefined {
  return models.get(resolveModelAlias(alias));
}

export function listModels(): ModelInfo[] {
  return Array.from(models.values());
}

export function listModelsByProvider(provider: ProviderType): ModelInfo[] {
  return listModels().filter((m) => m.provider === provider);
}

export function findModels(query: string): ModelInfo[] {
  const lower = query.toLowerCase();
  return listModels().filter(
    (m) =>
      m.id.toLowerCase().includes(lower) ||
      m.name.toLowerCase().includes(lower),
  );
}
