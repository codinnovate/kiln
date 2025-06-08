# kiln

**Terminal coding agent. Forges code with you.**

A production-grade CLI tool for AI-assisted software engineering. Multi-model support, file editing, shell execution, git tools, smart context management, session persistence, and a safety-first permission system.

---

## Features

- **Multi-model support** - OpenAI, Anthropic, Google, OpenRouter, Ollama, and custom endpoints
- **File editing** - Read, write, and search-and-replace file operations with line numbers
- **Shell execution** - Run commands with automatic safety classification and permission checks
- **Git tools** - Status, diff, log, add, commit, branch, and checkout operations
- **Smart context engine** - Automatic token budgeting and conversation history management
- **Session persistence** - Save, resume, and search past conversations
- **Conversation compaction** - Automatically summarize long conversations to stay within token limits
- **Permission system** - Safety-first approach with per-command and wildcard approval
- **Rich terminal UI** - React/Ink-based interface with streaming output and interactive prompts
- **Project memory** - AGENTS.md files for persistent project-specific instructions

## Installation

```bash
npm install -g kiln-cli
```

Or run directly without installing:

```bash
npx kiln-cli
```

## Quick Start

1. Set up an API key:

```bash
kiln auth
# or set an environment variable
export ANTHROPIC_API_KEY=sk-ant-...
```

2. Start an interactive session:

```bash
kiln
```

3. Run a single prompt:

```bash
kiln run "add error handling to the login function"
```

4. Initialize project memory:

```bash
kiln init
```

This creates an `AGENTS.md` file in your project root that the agent reads for persistent context.

## Configuration

Kiln uses a layered configuration system. Config files are loaded in order, with later values overriding earlier ones.

### Global Config

Location: `~/.kiln/config.json`

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet",
  "providers": {
    "anthropic": {
      "type": "anthropic",
      "models": ["claude-sonnet-4-20250514"],
      "defaultModel": "claude-sonnet-4-20250514"
    },
    "openai": {
      "type": "openai",
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  },
  "theme": "dark",
  "debug": false
}
```

### Project Config

Location: `.kiln/config.json` (in project root)

```json
{
  "instructions": "Always use TypeScript strict mode. Follow the existing code style.",
  "allowedCommands": ["npm test", "npm run build"],
  "blockedCommands": ["rm -rf", "sudo"]
}
```

### Credentials

Location: `~/.kiln/credentials.json`

API keys are stored separately from configuration. The credentials file is created with `0600` permissions.

```bash
kiln auth set anthropic sk-ant-...
kiln auth set openai sk-...
```

### Environment Variables

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AI...
OPENROUTER_API_KEY=sk-or-...
KILN_DEBUG=1
```

### Configuration Priority

1. Command-line flags (`--model`, `--provider`)
2. Project config (`.kiln/config.json`)
3. Global config (`~/.kiln/config.json`)
4. Credentials file (`~/.kiln/credentials.json`)
5. Environment variables (`.env` or shell)

## Supported Providers

| Provider | Models | API Key Env Var |
|----------|--------|-----------------|
| OpenAI | GPT-4o, GPT-4o Mini, GPT-4.1, o3, o4-mini, GPT-5 | `OPENAI_API_KEY` |
| Anthropic | Claude Sonnet 4, Claude Opus 4, Claude 3.5 Haiku, Claude 3.7 Sonnet | `ANTHROPIC_API_KEY` |
| Google | Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash | `GOOGLE_API_KEY` |
| OpenRouter | All OpenRouter models | `OPENROUTER_API_KEY` |
| Ollama | Any local Ollama model | (none required) |
| Custom | Any OpenAI-compatible API | (configure `baseUrl`) |

### Model Aliases

For convenience, short aliases are available:

| Alias | Full Model ID |
|-------|---------------|
| `claude-sonnet` | `anthropic/claude-sonnet-4-20250514` |
| `claude-haiku` | `anthropic/claude-3-5-haiku-20241022` |
| `claude-opus` | `anthropic/claude-opus-4-20250514` |
| `gpt-4o` | `openai/gpt-4o` |
| `gpt-4o-mini` | `openai/gpt-4o-mini` |
| `gpt-5` | `openai/gpt-5` |
| `gemini` | `google/gemini-2.5-flash` |
| `gemini-pro` | `google/gemini-2.5-pro` |

## Commands

### `kiln [project-path]`

Start an interactive session. If `project-path` is provided, it becomes the working directory. Otherwise, uses the current directory.

```bash
kiln                          # interactive in current directory
kiln ./my-project             # interactive in specified directory
kiln -m claude-sonnet         # use specific model
kiln --no-permissions         # auto-approve all operations
kiln --compact                # enable auto-compaction
```

### `kiln run <prompt>`

Run a single prompt non-interactively. The agent executes the prompt and exits.

```bash
kiln run "add unit tests for UserService"
kiln run "fix the TypeScript errors" --model gpt-4o
kiln run "explain this codebase" --no-permissions
```

### `kiln models`

List all available models grouped by provider.

```bash
kiln models
kiln models --provider anthropic
```

### `kiln config`

Manage global and project configuration.

```bash
kiln config set defaultProvider anthropic
kiln config set defaultModel claude-sonnet
kiln config get
kiln config list
```

### `kiln doctor`

Run a health check to verify your setup. Checks for installed tools, API keys, and configuration.

```bash
kiln doctor
```

### `kiln auth`

Manage API keys securely.

```bash
kiln auth                  # interactive setup
kiln auth set anthropic    # set key for provider
kiln auth list             # show configured providers
kiln auth remove openai    # remove a key
```

### `kiln history`

Browse past sessions.

```bash
kiln history
kiln history --limit 10
kiln history --search "error handling"
```

### `kiln resume <id>`

Resume a previous session by its ID.

```bash
kiln resume abc123-def456
```

### `kiln init`

Initialize project memory by creating an `AGENTS.md` file in the current directory.

```bash
kiln init
```

## Tool System

Kiln provides built-in tools that the AI agent can use to interact with your project:

### Filesystem Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line numbers |
| `write_file` | Create or overwrite a file |
| `edit_file` | Search-and-replace edits |
| `delete_file` | Delete a file |
| `list_directory` | List directory contents with types and sizes |
| `search_files` | Regex search across file contents |
| `glob_files` | Find files matching glob patterns |
| `get_file_info` | Get file metadata |

### Shell Tools

| Tool | Description |
|------|-------------|
| `run_command` | Execute shell commands with safety classification |

### Git Tools

| Tool | Description |
|------|-------------|
| `git_status` | Show working tree status |
| `git_diff` | Show changes |
| `git_log` | Show recent commits |
| `git_add` | Stage files |
| `git_commit` | Create commits |
| `git_branch` | List, create, or delete branches |
| `git_checkout` | Switch branches or restore files |

### Safety Classification

Every shell command is classified into one of four safety levels:

- **safe** - Read-only commands (`ls`, `cat`, `git status`) execute without prompting
- **moderate** - Package installs, git add/commit prompt for confirmation
- **dangerous** - `rm`, force push, hard reset prompt with explanation
- **blocked** - Catastrophic commands (`rm -rf /`, fork bombs) are always rejected

## Architecture

```
kiln
├── cli/              Commander CLI entrypoint
│   └── commands/     Subcommand implementations
├── agent/            Core agent loop and prompts
├── providers/        LLM provider implementations
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── google.ts
│   ├── openrouter.ts
│   ├── ollama.ts
│   └── custom.ts
├── models/           Model registry, aliases, and types
├── tools/            Tool definitions and registry
│   ├── filesystem.ts
│   ├── shell.ts
│   └── git.ts
├── context/          Context engine and token estimation
├── sessions/         Session persistence and compaction
├── permissions/      Permission system and store
├── shell/            Command execution and safety classification
├── tui/              React/Ink terminal interface
│   ├── components/   UI components
│   └── hooks/        React hooks
├── config/           Configuration loading and credentials
└── utils/            Shared utilities
```

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Development

### Prerequisites

- Node.js >= 18
- npm or yarn

### Setup

```bash
git clone https://github.com/yourorg/kiln.git
cd kiln
npm install
```

### Scripts

```bash
npm run build        # Build with tsup
npm run dev          # Run in development mode
npm test             # Run tests with Vitest
npm run lint         # Lint with ESLint
npm run typecheck    # Type-check with tsc
npm run format       # Format with Prettier
```

### Project Structure

- `src/` - TypeScript source code (ESM modules)
- `tests/` - Unit and integration tests
- `docs/` - Documentation
- `dist/` - Built output (gitignored)

## Testing

```bash
npm test                   # run all tests
npm test -- --watch        # watch mode
npm test -- --coverage     # with coverage
```

Tests are organized as:
- `tests/unit/` - Unit tests for individual modules
- `tests/integration/` - Integration tests for combined functionality

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
