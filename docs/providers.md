# Provider Configuration

Kiln supports multiple LLM providers. This guide covers setup for each one.

## OpenAI

### API Key Setup

```bash
# Option 1: Environment variable
export OPENAI_API_KEY=sk-...

# Option 2: Kiln credential manager
kiln auth set openai sk-...

# Option 3: Global config
# ~/.kiln/config.json
{
  "providers": {
    "openai": {
      "type": "openai",
      "apiKey": "sk-..."
    }
  }
}
```

### Available Models

| Model ID | Alias | Context Window | Max Output | Tools | Reasoning |
|----------|-------|---------------|------------|-------|-----------|
| `openai/gpt-4o` | `gpt-4o` | 128K | 16K | Yes | No |
| `openai/gpt-4o-mini` | `gpt-4o-mini` | 128K | 16K | Yes | No |
| `openai/gpt-4.1` | - | 1M | 32K | Yes | No |
| `openai/gpt-4.1-mini` | - | 1M | 32K | Yes | No |
| `openai/gpt-4.1-nano` | - | 1M | 32K | Yes | No |
| `openai/o3` | - | 200K | 100K | Yes | Yes |
| `openai/o4-mini` | - | 200K | 100K | Yes | Yes |
| `openai/gpt-5` | `gpt-5` | 400K | 100K | Yes | Yes |
| `openai/gpt-5-mini` | - | 400K | 100K | Yes | Yes |
| `openai/gpt-5-nano` | - | 400K | 100K | Yes | Yes |

### Usage

```bash
kiln -m gpt-4o
kiln run "explain this function" -m openai/gpt-4o
```

## Anthropic

### API Key Setup

```bash
# Option 1: Environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: Kiln credential manager
kiln auth set anthropic sk-ant-...

# Option 3: Global config
# ~/.kiln/config.json
{
  "providers": {
    "anthropic": {
      "type": "anthropic",
      "apiKey": "sk-ant-..."
    }
  }
}
```

### Available Models

| Model ID | Alias | Context Window | Max Output | Tools | Reasoning |
|----------|-------|---------------|------------|-------|-----------|
| `anthropic/claude-sonnet-4-20250514` | `claude-sonnet` | 200K | 16K | Yes | Yes |
| `anthropic/claude-opus-4-20250514` | `claude-opus` | 200K | 32K | Yes | Yes |
| `anthropic/claude-3-5-haiku-20241022` | `claude-haiku` | 200K | 8K | Yes | No |
| `anthropic/claude-3-7-sonnet-20250219` | - | 200K | 16K | Yes | Yes |

### Usage

```bash
kiln -m claude-sonnet
kiln run "refactor the auth module" -m anthropic/claude-sonnet-4-20250514
```

### Notes

- Anthropic uses the Messages API format
- Extended thinking is supported for reasoning models
- Tool use follows Anthropic's tool_use/tool_result format

## Google

### API Key Setup

```bash
# Option 1: Environment variable
export GOOGLE_API_KEY=AI...

# Option 2: Kiln credential manager
kiln auth set google AI...

# Option 3: Global config
# ~/.kiln/config.json
{
  "providers": {
    "google": {
      "type": "google",
      "apiKey": "AI..."
    }
  }
}
```

### Available Models

| Model ID | Alias | Context Window | Max Output | Tools | Reasoning |
|----------|-------|---------------|------------|-------|-----------|
| `google/gemini-2.5-pro` | `gemini-pro` | 1M | 64K | Yes | Yes |
| `google/gemini-2.5-flash` | `gemini` | 1M | 64K | Yes | Yes |
| `google/gemini-2.0-flash` | - | 1M | 8K | Yes | No |

### Usage

```bash
kiln -m gemini-pro
kiln run "write tests for the API" -m google/gemini-2.5-flash
```

### Notes

- Google uses the Generative AI API (vertex.ai compatible)
- Large context windows (1M tokens) make these models good for codebase-wide tasks

## OpenRouter

OpenRouter provides access to models from multiple providers through a single API.

### API Key Setup

```bash
# Option 1: Environment variable
export OPENROUTER_API_KEY=sk-or-...

# Option 2: Kiln credential manager
kiln auth set openrouter sk-or-...

# Option 3: Global config
# ~/.kiln/config.json
{
  "providers": {
    "openrouter": {
      "type": "openrouter",
      "apiKey": "sk-or-..."
    }
  }
}
```

### Usage

```bash
kiln -m openrouter/meta-llama/llama-3.1-405b-instruct
kiln run "optimize this query" -m openrouter/deepseek/deepseek-r1
```

### Notes

- Uses the OpenAI-compatible API format
- Any model available on OpenRouter can be used
- Pricing varies by model (billed through OpenRouter)

## Ollama

Ollama runs models locally on your machine. No API key required.

### Setup

1. Install Ollama: https://ollama.com
2. Pull a model: `ollama pull codellama`
3. Ensure Ollama is running: `ollama serve`

### Configuration

No configuration needed for default Ollama setup (localhost:11434).

For custom Ollama endpoints:

```json
{
  "providers": {
    "ollama": {
      "type": "ollama",
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

### Usage

```bash
kiln -m ollama/codellama
kiln run "explain this code" -m ollama/llama3.1
```

### Notes

- No API key required
- Performance depends on your hardware
- Models must be pulled with `ollama pull` before use
- Default base URL: `http://localhost:11434`

## Custom Endpoints

For any OpenAI-compatible API (vLLM, LiteLLM, LocalAI, etc.):

### Configuration

```json
{
  "providers": {
    "custom": {
      "type": "custom",
      "baseUrl": "http://localhost:8000/v1",
      "apiKey": "your-key-if-needed",
      "models": ["your-model-name"]
    }
  }
}
```

### Usage

```bash
kiln -m custom/your-model-name
```

### Notes

- Must implement the OpenAI chat completions API format
- Tool use support depends on the backend
- Streaming is supported for OpenAI-compatible endpoints

## Provider Resolution

When you specify a model, Kiln resolves the provider in this order:

1. **Model registry lookup** - Checks if the model ID is in the built-in registry
2. **Provider prefix** - Parses `provider/model-id` format (e.g., `openai/gpt-4o`)
3. **Default provider** - Uses `defaultProvider` from global config
4. **First valid provider** - Iterates configured providers and uses the first with a valid key
5. **Environment fallback** - Checks `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`

### Priority Example

If your config has:
```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "openai": { "apiKey": "sk-..." },
    "anthropic": { "apiKey": "sk-ant-..." }
  }
}
```

Then:
- `claude-sonnet` → Anthropic (model registry)
- `openai/gpt-4o` → OpenAI (provider prefix)
- `gpt-4o` → OpenAI (model registry)
- Any unknown model → Anthropic (default provider)

## Checking Your Setup

Run the doctor command to verify provider configuration:

```bash
kiln doctor
```

This checks for:
- Configured providers
- Available API keys
- Model availability
- Connectivity (optional)
