import { describe, it, expect } from 'vitest';
import { resolveModelAlias, MODEL_ALIASES } from '../../src/models/aliases.js';
import {
  getModel,
  getModelByAlias,
  findModels,
  listModels,
  listModelsByProvider,
} from '../../src/models/registry.js';

describe('resolveModelAlias', () => {
  it('resolves known aliases to full model IDs', () => {
    expect(resolveModelAlias('gpt-4o')).toBe('openai/gpt-4o');
    expect(resolveModelAlias('gpt-4o-mini')).toBe('openai/gpt-4o-mini');
    expect(resolveModelAlias('gpt-5')).toBe('openai/gpt-5');
    expect(resolveModelAlias('claude-sonnet')).toBe('anthropic/claude-sonnet-4-20250514');
    expect(resolveModelAlias('claude-haiku')).toBe('anthropic/claude-3-5-haiku-20241022');
    expect(resolveModelAlias('claude-opus')).toBe('anthropic/claude-opus-4-20250514');
    expect(resolveModelAlias('gemini')).toBe('google/gemini-2.5-flash');
    expect(resolveModelAlias('gemini-pro')).toBe('google/gemini-2.5-pro');
  });

  it('passes through unknown aliases unchanged', () => {
    expect(resolveModelAlias('openai/gpt-4o')).toBe('openai/gpt-4o');
    expect(resolveModelAlias('anthropic/claude-sonnet-4-20250514')).toBe('anthropic/claude-sonnet-4-20250514');
    expect(resolveModelAlias('completely-unknown-model')).toBe('completely-unknown-model');
    expect(resolveModelAlias('')).toBe('');
  });

  it('has all expected alias keys', () => {
    const expectedKeys = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-5',
      'claude-sonnet', 'claude-haiku', 'claude-opus',
      'gemini', 'gemini-pro',
    ];
    for (const key of expectedKeys) {
      expect(MODEL_ALIASES).toHaveProperty(key);
    }
  });
});

describe('getModel', () => {
  it('returns model info for valid IDs', () => {
    const gpt4o = getModel('openai/gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.name).toBe('GPT-4o');
    expect(gpt4o!.provider).toBe('openai');
    expect(gpt4o!.contextWindow).toBe(128_000);
    expect(gpt4o!.supportsTools).toBe(true);
    expect(gpt4o!.supportsStreaming).toBe(true);
  });

  it('returns model info for anthropic models', () => {
    const claude = getModel('anthropic/claude-sonnet-4-20250514');
    expect(claude).toBeDefined();
    expect(claude!.name).toBe('Claude Sonnet 4');
    expect(claude!.provider).toBe('anthropic');
    expect(claude!.supportsReasoning).toBe(true);
  });

  it('returns model info for google models', () => {
    const gemini = getModel('google/gemini-2.5-flash');
    expect(gemini).toBeDefined();
    expect(gemini!.name).toBe('Gemini 2.5 Flash');
    expect(gemini!.provider).toBe('google');
    expect(gemini!.contextWindow).toBe(1_048_576);
  });

  it('returns undefined for invalid IDs', () => {
    expect(getModel('nonexistent/model')).toBeUndefined();
    expect(getModel('')).toBeUndefined();
    expect(getModel('gpt-4o')).toBeUndefined();
  });

  it('has correct cost data', () => {
    const model = getModel('openai/gpt-4o');
    expect(model!.costPerInputToken).toBeCloseTo(2.5 / 1_000_000);
    expect(model!.costPerOutputToken).toBeCloseTo(10 / 1_000_000);
  });
});

describe('getModelByAlias', () => {
  it('resolves aliases to model info', () => {
    const gpt4o = getModelByAlias('gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o!.id).toBe('openai/gpt-4o');
  });

  it('resolves claude alias', () => {
    const claude = getModelByAlias('claude-sonnet');
    expect(claude).toBeDefined();
    expect(claude!.id).toBe('anthropic/claude-sonnet-4-20250514');
  });

  it('resolves gemini alias', () => {
    const gemini = getModelByAlias('gemini');
    expect(gemini).toBeDefined();
    expect(gemini!.id).toBe('google/gemini-2.5-flash');
  });

  it('returns undefined for unknown aliases', () => {
    expect(getModelByAlias('unknown-alias')).toBeUndefined();
  });

  it('works with full model IDs (passthrough)', () => {
    const model = getModelByAlias('openai/gpt-4o');
    expect(model).toBeDefined();
    expect(model!.id).toBe('openai/gpt-4o');
  });
});

describe('listModels', () => {
  it('returns all registered models', () => {
    const models = listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.length).toBe(24);
  });

  it('each model has required fields', () => {
    const models = listModels();
    for (const model of models) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.provider).toBeTruthy();
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxOutput).toBeGreaterThan(0);
      expect(typeof model.supportsTools).toBe('boolean');
      expect(typeof model.supportsStreaming).toBe('boolean');
    }
  });
});

describe('listModelsByProvider', () => {
  it('returns only openai models', () => {
    const models = listModelsByProvider('openai');
    expect(models.length).toBe(10);
    for (const model of models) {
      expect(model.provider).toBe('openai');
    }
  });

  it('returns only anthropic models', () => {
    const models = listModelsByProvider('anthropic');
    expect(models.length).toBe(4);
    for (const model of models) {
      expect(model.provider).toBe('anthropic');
    }
  });

  it('returns only google models', () => {
    const models = listModelsByProvider('google');
    expect(models.length).toBe(3);
    for (const model of models) {
      expect(model.provider).toBe('google');
    }
  });

  it('returns empty array for provider with no models', () => {
    const models = listModelsByProvider('ollama');
    expect(models).toEqual([]);
  });
});

describe('findModels', () => {
  it('finds models by ID substring', () => {
    const results = findModels('gpt-4o');
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const model of results) {
      expect(model.id.toLowerCase()).toContain('gpt-4o');
    }
  });

  it('finds models by name substring', () => {
    const results = findModels('Claude');
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const model of results) {
      expect(model.name.toLowerCase()).toContain('claude');
    }
  });

  it('search is case insensitive', () => {
    const results = findModels('GPT-5');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for no matches', () => {
    const results = findModels('xyznonexistent');
    expect(results).toEqual([]);
  });

  it('finds models by partial match', () => {
    const results = findModels('gemini');
    expect(results.length).toBe(3);
  });

  it('finds models matching a provider prefix', () => {
    const results = findModels('anthropic/');
    expect(results.length).toBeGreaterThanOrEqual(4);
    for (const model of results) {
      expect(model.id).toContain('anthropic/');
    }
  });

  it('finds models by name keyword across providers', () => {
    const results = findModels('Mini');
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const model of results) {
      expect(model.name.toLowerCase()).toContain('mini');
    }
  });
});

describe('getModel edge cases', () => {
  it('returns correct info for o3 reasoning model', () => {
    const model = getModel('openai/o3');
    expect(model).toBeDefined();
    expect(model!.supportsReasoning).toBe(true);
    expect(model!.supportsTools).toBe(true);
    expect(model!.maxOutput).toBe(100_000);
  });

  it('returns correct info for o4-mini reasoning model', () => {
    const model = getModel('openai/o4-mini');
    expect(model).toBeDefined();
    expect(model!.supportsReasoning).toBe(true);
  });

  it('returns correct info for all Anthropic models', () => {
    const anthropicModels = [
      'anthropic/claude-sonnet-4-20250514',
      'anthropic/claude-opus-4-20250514',
      'anthropic/claude-3-5-haiku-20241022',
      'anthropic/claude-3-7-sonnet-20250219',
    ];
    for (const id of anthropicModels) {
      const model = getModel(id);
      expect(model).toBeDefined();
      expect(model!.provider).toBe('anthropic');
    }
  });

  it('returns correct info for Gemini 2.0 Flash', () => {
    const model = getModel('google/gemini-2.0-flash');
    expect(model).toBeDefined();
    expect(model!.supportsReasoning).toBe(false);
    expect(model!.contextWindow).toBe(1_048_576);
  });

  it('returns GPT-5 family models', () => {
    const gpt5 = getModel('openai/gpt-5');
    expect(gpt5).toBeDefined();
    expect(gpt5!.supportsReasoning).toBe(true);
    expect(gpt5!.contextWindow).toBe(400_000);

    const gpt5mini = getModel('openai/gpt-5-mini');
    expect(gpt5mini).toBeDefined();
    expect(gpt5mini!.supportsReasoning).toBe(true);

    const gpt5nano = getModel('openai/gpt-5-nano');
    expect(gpt5nano).toBeDefined();
    expect(gpt5nano!.supportsReasoning).toBe(true);
  });

  it('all models have positive costs', () => {
    const allModels = [
      'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4.1',
      'openai/gpt-4.1-mini', 'openai/gpt-4.1-nano',
      'openai/o3', 'openai/o4-mini',
      'openai/gpt-5', 'openai/gpt-5-mini', 'openai/gpt-5-nano',
      'anthropic/claude-sonnet-4-20250514',
      'anthropic/claude-opus-4-20250514',
      'anthropic/claude-3-5-haiku-20241022',
      'anthropic/claude-3-7-sonnet-20250219',
      'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
      'google/gemini-2.0-flash',
    ];
    for (const id of allModels) {
      const model = getModel(id);
      expect(model!.costPerInputToken).toBeGreaterThan(0);
      expect(model!.costPerOutputToken).toBeGreaterThan(0);
    }
  });
});

describe('getModelByAlias edge cases', () => {
  it('resolves all known aliases to valid models', () => {
    const aliasTargets: Record<string, string> = {
      'gpt-4o': 'openai/gpt-4o',
      'gpt-4o-mini': 'openai/gpt-4o-mini',
      'gpt-5': 'openai/gpt-5',
      'claude-sonnet': 'anthropic/claude-sonnet-4-20250514',
      'claude-haiku': 'anthropic/claude-3-5-haiku-20241022',
      'claude-opus': 'anthropic/claude-opus-4-20250514',
      'gemini': 'google/gemini-2.5-flash',
      'gemini-pro': 'google/gemini-2.5-pro',
    };
    for (const [alias, expectedId] of Object.entries(aliasTargets)) {
      const model = getModelByAlias(alias);
      expect(model).toBeDefined();
      expect(model!.id).toBe(expectedId);
    }
  });

  it('returns undefined for alias that resolves to unknown ID', () => {
    // Alias exists but the resolved ID is not registered
    expect(getModelByAlias('nonexistent-shortcut')).toBeUndefined();
  });
});

describe('listModelsByProvider edge cases', () => {
  it('returns empty for unregistered providers', () => {
    expect(listModelsByProvider('openrouter')).toEqual([]);
    expect(listModelsByProvider('custom')).toEqual([]);
  });

  it('each provider group has valid models', () => {
    const providers = ['openai', 'anthropic', 'google'] as const;
    for (const p of providers) {
      const models = listModelsByProvider(p);
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.provider).toBe(p);
        expect(m.id).toContain(p + '/');
      }
    }
  });
});
