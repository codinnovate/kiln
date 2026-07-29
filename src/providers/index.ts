import type { ProviderType } from '../models/provider.js';
import type { Config } from '../config/schema.js';
import { getModel } from '../models/registry.js';
import { BaseProvider, ProviderError } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { OpenRouterProvider } from './openrouter.js';
import { OllamaProvider } from './ollama.js';
import { CustomProvider } from './custom.js';
import { ZenProvider } from './zen.js';

export { BaseProvider, ProviderError } from './base.js';
export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export { GoogleProvider } from './google.js';
export { OpenRouterProvider } from './openrouter.js';
export { OllamaProvider } from './ollama.js';
export { CustomProvider } from './custom.js';
export { ZenProvider } from './zen.js';

export function createProvider(
  type: ProviderType,
  apiKey?: string,
  baseUrl?: string,
): BaseProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider(apiKey, baseUrl);
    case 'anthropic':
      return new AnthropicProvider(apiKey, baseUrl);
    case 'google':
      return new GoogleProvider(apiKey, baseUrl);
    case 'openrouter':
      return new OpenRouterProvider(apiKey, baseUrl);
    case 'ollama':
      return new OllamaProvider(apiKey, baseUrl);
    case 'custom':
      return new CustomProvider(apiKey, baseUrl);
    case 'zen':
      return new ZenProvider();
    default:
      throw new ProviderError(
        `Unknown provider type: ${type}`,
        'UNKNOWN_PROVIDER',
        type as ProviderType,
      );
  }
}

export function createProviderFromConfig(
  config: Config,
  model?: string,
): BaseProvider {
  if (model) {
    const modelInfo = getModel(model);
    if (modelInfo) {
      const providerConfig = config.global.providers[modelInfo.provider];
      if (providerConfig) {
        const apiKey =
          providerConfig.apiKey ??
          config.credentials[modelInfo.provider] ??
          undefined;
        const provider = createProvider(
          providerConfig.type,
          apiKey,
          providerConfig.baseUrl,
        );
        if (provider.validate()) return provider;
      }

      const envApiKey = resolveEnvApiKey(modelInfo.provider);
      if (envApiKey) {
        const provider = createProvider(modelInfo.provider, envApiKey);
        if (provider.validate()) return provider;
      }
    }

    const slashIndex = model.indexOf('/');
    if (slashIndex !== -1) {
      const providerPrefix = model.slice(0, slashIndex) as ProviderType;
      const validTypes: ProviderType[] = [
        'openai',
        'anthropic',
        'google',
        'openrouter',
        'ollama',
        'custom',
        'zen',
      ];
      if (validTypes.includes(providerPrefix)) {
        const providerConfig = config.global.providers[providerPrefix];
        const apiKey =
          providerConfig?.apiKey ??
          config.credentials[providerPrefix] ??
          resolveEnvApiKey(providerPrefix);
        const provider = createProvider(
          providerPrefix,
          apiKey,
          providerConfig?.baseUrl,
        );
        if (provider.validate()) return provider;
      }
    }
  }

  if (config.global.defaultProvider) {
    const providerConfig =
      config.global.providers[config.global.defaultProvider];
    const apiKey =
      providerConfig?.apiKey ??
      config.credentials[config.global.defaultProvider] ??
      resolveEnvApiKey(config.global.defaultProvider);
    const provider = createProvider(
      config.global.defaultProvider,
      apiKey,
      providerConfig?.baseUrl,
    );
    if (provider.validate()) return provider;
  }

  for (const [name, providerConfig] of Object.entries(config.global.providers)) {
    const apiKey =
      providerConfig.apiKey ??
      config.credentials[name] ??
      resolveEnvApiKey(providerConfig.type);
    const provider = createProvider(
      providerConfig.type,
      apiKey,
      providerConfig.baseUrl,
    );
    if (provider.validate()) return provider;
  }

  const envProviders: ProviderType[] = ['openai', 'anthropic', 'google'];
  for (const p of envProviders) {
    const envKey = resolveEnvApiKey(p);
    if (envKey) {
      const provider = createProvider(p, envKey);
      if (provider.validate()) return provider;
    }
  }

  throw new ProviderError(
    'No provider configured. Set up a provider in ~/.kiln/config.json or provide an API key via environment variable.',
    'NO_PROVIDER',
    'openai',
  );
}

function resolveEnvApiKey(type: ProviderType): string | undefined {
  switch (type) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'google':
      return process.env.GOOGLE_API_KEY;
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY;
    case 'ollama':
      return 'ollama';
    case 'zen':
      return process.env.ZEN_API_KEY;
    default:
      return undefined;
  }
}
