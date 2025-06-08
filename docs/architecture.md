# Architecture

This document describes the internal architecture of Kiln, including module responsibilities, data flow, and key abstractions.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          User Input                             │
│                    (terminal / CLI args)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                               │
│                    src/cli/index.ts                              │
│              Commander parses commands and flags                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────────┐ ┌──────────┐ ┌──────────────┐
│   TUI (Ink)      │ │  run     │ │  config/     │
│   Interactive    │ │  Non-    │ │  auth/       │
│   Session        │ │  interact│ │  doctor/     │
└────────┬─────────┘ └────┬─────┘ └──────────────┘
         │                │
         └───────┬────────┘
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Agent Loop                                │
│                   src/agent/loop.ts                             │
│                                                                 │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Context  │  │ Provider │  │  Tools   │  │  Permissions  │   │
│  │ Engine   │  │ (LLM)    │  │ Registry │  │  Manager      │   │
│  └─────────┘  └──────────┘  └──────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────┘
         │                │            │              │
         ▼                ▼            ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌─────────┐ ┌──────────────┐
│   Context    │ │   Provider   │ │  Shell  │ │  Permission  │
│   Builder    │ │   Implement  │ │  Exec   │ │  Store       │
│   Scanner    │ │   ations     │ │  Safety │ │  (~/.kiln/)  │
│   Token Est  │ │              │ │         │ │              │
└──────────────┘ └──────────────┘ └─────────┘ └──────────────┘
                                         │
                                         ▼
                                ┌──────────────┐
                                │   Sessions   │
                                │   Manager    │
                                │   Store      │
                                │   (~/.kiln/) │
                                └──────────────┘
```

## Module Descriptions

### CLI Layer (`src/cli/`)

The entrypoint. Uses Commander to parse commands and route to implementations.

- `index.ts` - Program definition, global options, command registration
- `commands/*.ts` - Individual command implementations (run, models, config, doctor, auth, history, resume)

### Agent (`src/agent/`)

The core orchestration layer that drives LLM interactions.

- `loop.ts` - `AgentLoop` class: manages the chat loop, streams responses, dispatches tool calls, handles permissions
- `prompts.ts` - System prompt construction with repo context
- `types.ts` - `AgentConfig`, `AgentEvent`, `AgentState` types

The agent loop follows this pattern per iteration:
1. Build messages (system prompt + context + conversation history)
2. Stream completion from the provider
3. Collect text deltas and tool calls from the stream
4. For each tool call, check permissions and execute
5. Append results to conversation
6. Repeat until no tool calls or max iterations reached

### Providers (`src/providers/`)

LLM provider implementations. Each extends `BaseProvider`.

- `base.ts` - Abstract `BaseProvider` class with error handling
- `openai.ts` - OpenAI API (also used for OpenAI-compatible endpoints)
- `anthropic.ts` - Anthropic Messages API
- `google.ts` - Google Generative AI API
- `openrouter.ts` - OpenRouter (routes to multiple providers)
- `ollama.ts` - Local Ollama server
- `custom.ts` - Any OpenAI-compatible API
- `index.ts` - `createProvider()` factory and `createProviderFromConfig()` resolver

Provider resolution priority:
1. Model-specific provider config from model registry
2. Provider prefix in model string (e.g., `openai/gpt-4o`)
3. Default provider from global config
4. First configured provider with a valid API key
5. Environment variable fallback

### Models (`src/models/`)

Model registry and type definitions.

- `provider.ts` - Core types: `Message`, `ToolCall`, `ToolResult`, `CompletionRequest`, `StreamChunk`
- `registry.ts` - Hardcoded model definitions with metadata (context window, cost, capabilities)
- `aliases.ts` - Short alias mapping (e.g., `claude-sonnet` → `anthropic/claude-sonnet-4-20250514`)

### Tools (`src/tools/`)

Built-in tool implementations and the tool registry.

- `registry.ts` - `ToolRegistry` class: registers tools, generates definitions, executes tool calls
- `filesystem.ts` - 8 filesystem tools (read, write, edit, delete, list, search, glob, info)
- `shell.ts` - Shell command execution tool with safety classification
- `git.ts` - 7 git tools (status, diff, log, add, commit, branch, checkout)

Each tool implements the `ToolHandler` interface:
```typescript
interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

### Context Engine (`src/context/`)

Manages what information the LLM sees, staying within token budgets.

- `engine.ts` - `ContextEngine` class: orchestrates context building, tracks file access, refreshes repo info
- `builder.ts` - `ContextBuilder` class: collects context entries, prioritizes by importance, fits within budget
- `scanner.ts` - Repository scanner: discovers files, reads package.json, gets git status, identifies languages
- `token-estimator.ts` - Token counting heuristic (chars-per-token with code vs text detection)
- `types.ts` - `ContextEntry`, `ContextBudget`, `ContextResult`, `RepoInfo` types

Context building flow:
1. Scan repository for structure and metadata
2. Add project instructions and config
3. Add conversation history (recent messages with full detail, older as summary)
4. Add file contents and git diffs as needed
5. Sort entries by priority
6. Fit within token budget, dropping low-priority entries
7. Return warnings for dropped high-priority entries

### Sessions (`src/sessions/`)

Session persistence and conversation management.

- `manager.ts` - `SessionManager` class: start, resume, save, list, search, delete sessions
- `store.ts` - `SessionStore` class: file-based persistence in `~/.kiln/sessions/`
- `compaction.ts` - `ConversationCompactor` class: summarizes old messages to reduce token count
- `types.ts` - `Session`, `SessionMetadata` types

Sessions are stored as JSON files named by UUID. Each contains metadata (model, project, timestamps) and the full message history.

### Permissions (`src/permissions/`)

Safety system for controlling tool execution.

- `manager.ts` - `PermissionManager` class: checks permissions, handles prompts, supports session and persistent approval
- `store.ts` - `PermissionStore` class: persistent permission patterns with glob matching
- `types.ts` - `PermissionRequest`, `PermissionDecision`, `StoredPermission` types

Permission check flow:
1. If safety level is "blocked" → deny
2. If safety level is "safe" → allow
3. If approved in current session → allow
4. If approved permanently (stored pattern matches) → allow
5. If auto-approve mode → allow
6. If prompt handler is set → prompt user
7. Default → deny

### Shell (`src/shell/`)

Command execution and safety analysis.

- `executor.ts` - `executeCommand()`: spawns child processes with timeout and output limits
- `safety.ts` - `classifyCommand()`: categorizes commands into safe/moderate/dangerous/blocked using regex patterns

Safety classification uses three pattern lists:
- **Blocked**: Patterns that must never execute (rm -rf /, fork bombs, etc.)
- **Dangerous**: Destructive operations requiring explicit approval (rm, force push, hard reset)
- **Moderate**: Common but impactful operations (npm install, git add, git commit)
- **Safe**: Read-only and informational commands (ls, cat, git status)

### TUI (`src/tui/`)

React/Ink terminal interface.

- `App.tsx` - Main application component, manages modes (chat, model select, permission)
- `index.tsx` - `startTUI()` entrypoint using Ink's `render()`
- `components/` - UI components (Header, ConversationView, CommandInput, StatusBar, PermissionPrompt, ModelSelector, etc.)
- `hooks/` - React hooks (useAgent, useInput)

The TUI renders:
- Header with model name and version
- Conversation view with streaming text and tool call/result display
- Command input with slash commands (/help, /model, /clear, /status, /quit)
- Status bar with token usage and debug info
- Permission prompts for dangerous operations

### Config (`src/config/`)

Configuration loading and credential management.

- `schema.ts` - Zod schemas for GlobalConfig, ProjectConfig, Credentials
- `loader.ts` - `loadConfig()`: merges global, project, and env configs
- `credentials.ts` - `CredentialManager`: secure storage with 0600 file permissions

## Data Flow

### Interactive Session

```
User types message
  → CommandInput component captures input
  → App.handleInputSubmit() routes command or message
  → useAgent hook calls agent.chat()
  → AgentLoop.chat() adds user message, starts runLoop()
  → runLoop() builds messages with context engine
  → Provider.stream() sends to LLM API
  → Stream chunks yield text/tool_call/usage events
  → TUI renders streaming text in ConversationView
  → Tool calls go through permission check
  → Tools execute and return results
  → Results added to conversation
  → Loop continues until no tool calls or max iterations
  → Session saved automatically
```

### Non-Interactive (kiln run)

```
CLI parses prompt from args
  → runCommand() creates agent config
  → AgentLoop processes prompt
  → Events logged to stdout
  → Exit code returned based on success/failure
```

## Key Abstractions

### BaseProvider

Abstract class that all LLM providers implement. Provides:
- `complete()` - Non-streaming completion
- `stream()` - Streaming completion via AsyncGenerator
- `validate()` - Check if API key is present
- `formatMessages()` - Convert internal messages to provider format
- `formatTools()` - Convert tool definitions to provider format
- `createErrorResponse()` - Normalize errors to `ProviderError`

### ToolHandler

Interface for all tools. Each tool defines its name, description, JSON Schema parameters, and an async execute function that receives parsed arguments and a context object.

### ContextBuilder

Builder pattern for constructing context. Entries are added with priorities and token estimates. The `build()` method sorts by priority and fits within the token budget, dropping entries that don't fit.

### PermissionManager

Centralized permission checking. Supports:
- Per-exact-match session approval
- Pattern-based permanent approval (glob matching)
- Wildcard approval (e.g., `npm *`)
- User prompting via callback
- Auto-approve mode for development
