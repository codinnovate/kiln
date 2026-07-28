# API Reference

Complete reference for Kiln's public API. All exports are available from the package entry point.

## Core Types

### Message

The fundamental unit of conversation between the user, assistant, and tools.

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}
```

### ContentPart

A piece of content within a message, supporting multimodal and tool content.

```typescript
interface ContentPart {
  type: 'text' | 'image_url' | 'tool_call' | 'tool_result';
  text?: string;
  imageUrl?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}
```

### ToolCall

Represents a tool invocation requested by the LLM.

```typescript
interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON-encoded arguments
}
```

### ToolResult

The result returned from executing a tool.

```typescript
interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}
```

### ToolDefinition

A tool's schema, sent to the LLM to describe available tools.

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}
```

### CompletionRequest

Request object sent to a provider for LLM completion.

```typescript
interface CompletionRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}
```

### CompletionResponse

Response from a non-streaming completion.

```typescript
interface CompletionResponse {
  message: Message;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}
```

### StreamChunk

A chunk of data yielded during streaming completion.

```typescript
type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: string }
  | { type: 'done' };
```

### ModelInfo

Metadata for a registered model.

```typescript
interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow: number;
  maxOutput: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  costPerInputToken: number;
  costPerOutputToken: number;
}
```

### ProviderType

Supported LLM providers.

```typescript
type ProviderType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'custom';
```

### ProviderConfig

Configuration for a single provider.

```typescript
interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
}
```

---

## Provider System

### BaseProvider

Abstract class that all LLM providers extend. Located at `src/providers/base.ts`.

```typescript
abstract class BaseProvider {
  abstract readonly type: ProviderType;
  abstract readonly name: string;

  constructor(apiKey?: string, baseUrl?: string);

  // Abstract - must be implemented by each provider
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;
  abstract stream(request: CompletionRequest): AsyncGenerator<StreamChunk>;

  // Configuration
  setMaxRetries(maxRetries: number): void;
  setOnRetry(callback: (attempt: number, maxAttempts: number, error: string) => void): void;

  // Validation
  validate(): boolean;

  // Internal helpers (protected)
  protected retryComplete(fn: () => Promise<CompletionResponse>): Promise<CompletionResponse>;
  protected streamWithRetry(createStream: () => AsyncGenerator<StreamChunk>): AsyncGenerator<StreamChunk>;
  protected abstract formatMessages(messages: Message[]): unknown[];
  protected abstract formatTools(tools?: ToolDefinition[]): unknown[] | undefined;
  protected extractModelId(model: string): string;
  protected resolveModelProvider(model: string): ProviderType | undefined;
  protected createErrorResponse(error: unknown): never;
}
```

**Usage:**
```typescript
import { createProvider } from 'kiln';

const provider = createProvider('openai', { apiKey: 'sk-...' });
provider.setMaxRetries(5);
provider.setOnRetry((attempt, max, error) => {
  console.log(`Retry ${attempt}/${max}: ${error}`);
});

const response = await provider.complete({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'openai/gpt-4o',
});
```

### ProviderError

Error class for provider-specific errors.

```typescript
class ProviderError extends Error {
  readonly code: 'RATE_LIMIT' | 'AUTH' | 'QUOTA' | 'CONNECTION' | 'UNKNOWN';
  readonly provider: ProviderType;

  constructor(message: string, code: string, provider: ProviderType);
}
```

### createProvider

Factory function to create a provider instance.

```typescript
function createProvider(
  type: ProviderType,
  config: { apiKey?: string; baseUrl?: string },
): BaseProvider;
```

### createProviderFromConfig

Resolves and creates a provider from a model string and configuration.

```typescript
function createProviderFromConfig(
  model: string,
  config: Config,
): BaseProvider;
```

### Retry Utilities

Located at `src/providers/retry.ts`.

```typescript
interface RetryConfig {
  maxRetries: number;   // default: 3
  baseDelay: number;    // default: 1000ms
  maxDelay: number;     // default: 30000ms
}

function isRetryableError(error: unknown): boolean;
function calculateBackoff(attempt: number, config: RetryConfig): number;
function sleep(ms: number): Promise<void>;
```

---

## Tool System

### ToolHandler

Interface that every tool must implement.

```typescript
interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

### ToolContext

Context object passed to every tool execution.

```typescript
interface ToolContext {
  cwd: string;
  permissions: PermissionChecker;
  onProgress?: (message: string) => void;
}
```

### PermissionChecker

Interface for checking permissions within tools.

```typescript
interface PermissionChecker {
  approve(path: string, action: 'read' | 'write' | 'delete' | 'execute'): boolean;
}
```

### ToolRegistry

Manages tool registration, lookup, and execution.

```typescript
class ToolRegistry {
  register(tool: ToolHandler): void;
  get(name: string): ToolHandler | undefined;
  list(): ToolHandler[];
  getDefinitions(): ToolDefinition[];
  execute(toolCall: ToolCall, context: ToolContext): Promise<ToolResult>;
}
```

**Usage:**
```typescript
import { ToolRegistry, createDefaultTools } from 'kiln';

const registry = createDefaultTools();

// List all registered tools
const tools = registry.list();

// Execute a tool call
const result = await registry.execute(
  { id: 'call-1', name: 'read_file', arguments: '{"path": "file.txt"}' },
  { cwd: '/project', permissions: { approve: () => true } },
);
```

### createDefaultTools

Creates a `ToolRegistry` pre-populated with all built-in tools (filesystem, shell, git).

```typescript
function createDefaultTools(): ToolRegistry;
```

---

## Context System

### ContextEngine

Manages context building for LLM requests, including repository scanning, AGENTS.md loading, and file tracking.

```typescript
class ContextEngine {
  constructor(cwd: string, budget?: Partial<ContextBudget>);

  async initialize(): Promise<void>;
  async buildContext(messages: Message[], additionalFiles?: string[]): Promise<ContextResult>;
  getRepoInfo(): RepoInfo | undefined;
  getAgentsMdContent(): string | undefined;
  trackFileAccess(path: string): void;
  getFileHistory(): string[];
  async refreshRepoInfo(): Promise<void>;
}
```

**Usage:**
```typescript
import { ContextEngine } from 'kiln';

const engine = new ContextEngine('/project');
await engine.initialize();

const context = await engine.buildContext([
  { role: 'user', content: 'What is in this project?' },
]);

console.log(`Context uses ${context.totalTokens} tokens`);
```

### ContextBuilder

Builder pattern for constructing context entries with priority and token budgeting.

```typescript
class ContextBuilder {
  constructor(budget?: Partial<ContextBudget>);

  addSystemPrompt(prompt: string): this;
  addProjectInstructions(instructions: string): this;
  addConversationHistory(messages: Message[]): this;
  addRepositoryContext(repoInfo: RepoInfo): this;
  addFileContent(path: string, content: string, priority?: number): this;
  addGitDiff(diff: string): this;
  addToolResult(result: ToolResult): this;
  addRecentFiles(files: string[]): this;
  build(): ContextResult;
}
```

### Context Types

```typescript
interface ContextEntry {
  type: 'file' | 'directory' | 'git' | 'config' | 'instruction' | 'history' | 'tool_result';
  content: string;
  tokenEstimate: number;
  priority: number;
  source: string;
  metadata?: Record<string, unknown>;
}

interface ContextBudget {
  maxTokens: number;              // default: 128000
  reservedForResponse: number;    // default: 4096
  reservedForSystem: number;      // default: 2048
  availableForContext: number;    // computed: maxTokens - reservedForResponse - reservedForSystem
}

interface ContextResult {
  entries: ContextEntry[];
  totalTokens: number;
  droppedEntries: string[];
  warnings: string[];
}

interface RepoInfo {
  root: string;
  files: FileInfo[];
  packageJson?: Record<string, unknown>;
  gitStatus?: string;
  recentCommits?: string[];
  languages: Record<string, number>;
  totalFiles: number;
  totalSize: number;
}

interface FileInfo {
  path: string;
  size: number;
  type: 'file' | 'directory';
  extension: string;
  lastModified: Date;
  language?: string;
}
```

---

## Agent System

### AgentLoop

The core orchestration class that drives LLM interactions, streams responses, dispatches tool calls, and manages permissions.

```typescript
class AgentLoop {
  constructor(
    provider: BaseProvider,
    tools: ToolRegistry,
    context: ContextEngine,
    permissions: PermissionManager,
    config: AgentConfig,
  );

  async initialize(): Promise<void>;
  async *chat(userMessage: string): AsyncGenerator<AgentEvent>;

  on(event: string, handler: (event: AgentEvent) => void): void;
  off(event: string, handler: (event: AgentEvent) => void): void;

  getState(): AgentState;
  getMessages(): Message[];
  reset(): void;
  abort(): void;
}
```

**Event types supported by `on()`:**
- `'text'` - Streamed text deltas
- `'tool_call'` - Tool invocation requested
- `'tool_result'` - Tool execution result
- `'thinking'` - Progress messages
- `'error'` - Error events
- `'done'` - Loop complete
- `'usage'` - Token usage updates
- `'permission_request'` - Permission prompt needed
- `'compaction'` - Conversation was compacted
- `'retry'` - Provider retry occurred
- `'*'` - All events

**Usage:**
```typescript
import { AgentLoop, ToolRegistry, ContextEngine, PermissionManager, createProvider } from 'kiln';

const provider = createProvider('openai', { apiKey: 'sk-...' });
const tools = new ToolRegistry();
const context = new ContextEngine('/project');
const permissions = new PermissionManager();

const agent = new AgentLoop(provider, tools, context, permissions, {
  model: 'openai/gpt-4o',
  provider: 'openai',
  cwd: '/project',
  maxIterations: 20,
});

await agent.initialize();

agent.on('text', (event) => process.stdout.write(event.data.text));
agent.on('error', (event) => console.error(event.data.message));
agent.on('done', (event) => console.log(`Done after ${event.data.iterations} iterations`));

for await (const event of agent.chat('Explain this project')) {
  // Events are yielded as they happen
}
```

### AgentConfig

Configuration for the agent loop.

```typescript
interface AgentConfig {
  model: string;
  provider: string;
  cwd: string;
  maxIterations: number;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  debug?: boolean;
  compact?: boolean;     // Enable conversation compaction
  maxRetries?: number;   // Provider retry limit (default: 3)
}
```

### AgentEvent

Events emitted during the agent loop lifecycle.

```typescript
interface AgentEvent {
  type:
    | 'text'
    | 'tool_call'
    | 'tool_result'
    | 'thinking'
    | 'error'
    | 'done'
    | 'usage'
    | 'permission_request'
    | 'compaction'
    | 'retry';
  data: unknown;
  timestamp: Date;
}
```

### AgentState

Snapshot of the agent's internal state.

```typescript
interface AgentState {
  messages: Message[];
  iterations: number;
  totalTokens: { input: number; output: number };
  activeTools: string[];
  isComplete: boolean;
}
```

### RetryEventData

Data included in retry events.

```typescript
interface RetryEventData {
  attempt: number;
  maxAttempts: number;
  error: string;
}
```

### buildSystemPrompt

Builds the system prompt with optional project context.

```typescript
function buildSystemPrompt(config: AgentConfig, repoInfo?: RepoInfo): string;
```

---

## Permission System

### PermissionManager

Centralizes permission checking for tool execution.

```typescript
class PermissionManager {
  constructor(options?: PermissionManagerOptions);

  isAlwaysAllowed(request: PermissionRequest): boolean;
  async check(request: PermissionRequest): Promise<PermissionDecision>;

  allowSession(request: PermissionRequest): void;
  allowAlways(request: PermissionRequest): void;
  allowWildcard(command: string): void;
  denyPermission(key: string): void;

  getStore(): PermissionStore;
  resetSession(): void;
}

interface PermissionManagerOptions {
  storePath?: string;
  autoApprove?: boolean;
  onPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
}
```

**Usage:**
```typescript
import { PermissionManager } from 'kiln';

const pm = new PermissionManager({
  autoApprove: false,
  onPrompt: async (request) => {
    const approved = await promptUser(request.description);
    return approved ? { action: 'allow' } : { action: 'deny' };
  },
});

const decision = await pm.check({
  type: 'command',
  target: 'npm install express',
  description: 'Install express package',
  safety: 'moderate',
});
```

### Permission Types

```typescript
interface PermissionRequest {
  type: 'command' | 'file_write' | 'file_delete';
  target: string;
  description: string;
  safety: CommandSafety;
}

interface PermissionDecision {
  action: 'allow' | 'allow_always' | 'deny';
  rememberKey?: string;
}

interface PermissionChecker {
  check(request: PermissionRequest): Promise<PermissionDecision>;
  isAlwaysAllowed(request: PermissionRequest): boolean;
}

interface StoredPermission {
  pattern: string;
  type: PermissionRequest['type'];
  addedAt: string;
  description?: string;
}
```

### PermissionStore

Persistent storage of approved permission patterns in `~/.kiln/permissions.json`.

```typescript
class PermissionStore {
  constructor(storePath?: string);

  addPermission(key: string, pattern: string, type: PermissionRequest['type'], description?: string): void;
  removePermission(key: string): boolean;
  listPermissions(): Array<StoredPermission & { key: string }>;
  isAllowed(request: PermissionRequest): boolean;
  makeKey(request: PermissionRequest): string;
  makeWildcardKey(command: string): string;
  hasPermission(key: string): boolean;
  clear(): void;
}
```

---

## Session System

### SessionManager

Manages session lifecycle (start, resume, save, list, search, delete).

```typescript
class SessionManager {
  constructor(store?: SessionStore);

  async startNewSession(config: AgentConfig): Promise<Session>;
  async resumeSession(id: string): Promise<Session>;
  async saveSession(session: Session): Promise<void>;
  async listSessions(limit?: number): Promise<SessionMetadata[]>;
  async deleteSession(id: string): Promise<void>;
  async searchSessions(query: string): Promise<SessionMetadata[]>;

  getCurrentSession(): Session | undefined;
  generateTitle(firstMessage: string): string;
}
```

**Usage:**
```typescript
import { SessionManager, SessionStore } from 'kiln';

const manager = new SessionManager();

const session = await manager.startNewSession({
  model: 'openai/gpt-4o',
  provider: 'openai',
  cwd: '/project',
  maxIterations: 20,
});

// List recent sessions
const recent = await manager.listSessions(10);

// Resume a session
const resumed = await manager.resumeSession(session.metadata.id);
```

### Session Types

```typescript
interface Session {
  metadata: SessionMetadata;
  messages: Message[];
  state?: {
    totalTokens: { input: number; output: number };
    iterations: number;
  };
}

interface SessionMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  provider: string;
  projectPath: string;
  messageCount: number;
  summary?: string;
}
```

### SessionStore

File-based session persistence in `~/.kiln/sessions/`.

```typescript
class SessionStore {
  constructor(basePath?: string);

  async save(session: Session): Promise<void>;
  async load(id: string): Promise<Session | null>;
  async delete(id: string): Promise<void>;
  async list(): Promise<SessionMetadata[]>;
  async exists(id: string): Promise<boolean>;

  generateId(): string;
  getFilePath(id: string): string;
}
```

### ConversationCompactor

Summarizes older messages to reduce token usage when approaching context window limits.

```typescript
class ConversationCompactor {
  constructor(provider: BaseProvider);

  async compact(messages: Message[], targetTokens: number): Promise<CompactionResult>;
}

interface CompactionResult {
  messages: Message[];
  summary: string;
  tokenSavings: number;
}
```

**Usage:**
```typescript
import { ConversationCompactor } from 'kiln';

const compactor = new ConversationCompactor(provider);
const result = await compactor.compact(longMessages, 64000);

console.log(`Saved ${result.tokenSavings} tokens`);
console.log(`Summary: ${result.summary}`);
```

---

## Configuration System

### Config

Top-level configuration object.

```typescript
interface Config {
  global: GlobalConfig;
  project: ProjectConfig;
  credentials: Credentials;
}
```

### GlobalConfig

Global configuration stored in `~/.kiln/config.json`.

```typescript
interface GlobalConfig {
  defaultProvider?: ProviderType;
  defaultModel?: string;
  providers: Record<string, ProviderConfig>;
  theme: 'dark' | 'light' | 'auto';
  debug: boolean;
  maxRetries: number;
}
```

### ProjectConfig

Project-level configuration stored in `<project>/.kiln/config.json`.

```typescript
interface ProjectConfig {
  instructions?: string;
  allowedCommands?: string[];
  blockedCommands?: string[];
}
```

### Credentials

API key storage (stored in `~/.kiln/credentials.json` with 0600 permissions).

```typescript
type Credentials = Record<string, string>;
```

### Config Loading

```typescript
function loadConfig(): Config;
function getConfigDir(): string;
function loadGlobalConfig(): GlobalConfig;
function loadProjectConfig(): ProjectConfig;
function loadCredentials(): Credentials;

function parseGlobalConfig(raw: unknown): GlobalConfig;
function parseProjectConfig(raw: unknown): ProjectConfig;
function parseCredentials(raw: unknown): Credentials;
```

### CredentialManager

Secure credential management with file permission enforcement.

```typescript
class CredentialManager {
  get(provider: string): string | undefined;
  set(provider: string, apiKey: string): void;
  list(): string[];
  delete(provider: string): void;
}
```

---

## Model Registry

### Model Lookup

```typescript
function getModel(id: string): ModelInfo | undefined;
function getModelByAlias(alias: string): ModelInfo | undefined;
function listModels(): ModelInfo[];
function listModelsByProvider(provider: ProviderType): ModelInfo[];
function findModels(query: string): ModelInfo[];
```

### Model Aliases

```typescript
const MODEL_ALIASES: Record<string, string>;
// 'gpt-4o'          → 'openai/gpt-4o'
// 'gpt-4o-mini'     → 'openai/gpt-4o-mini'
// 'gpt-5'           → 'openai/gpt-5'
// 'claude-sonnet'   → 'anthropic/claude-sonnet-4-20250514'
// 'claude-haiku'    → 'anthropic/claude-3-5-haiku-20241022'
// 'claude-opus'     → 'anthropic/claude-opus-4-20250514'
// 'gemini'          → 'google/gemini-2.5-flash'
// 'gemini-pro'      → 'google/gemini-2.5-pro'

function resolveModelAlias(alias: string): string;
```

---

## Shell Safety

### Safety Classification

```typescript
type CommandSafety = 'safe' | 'moderate' | 'dangerous' | 'blocked';

interface SafetyResult {
  level: CommandSafety;
  reason: string;
  suggestion?: string;
}

function classifyCommand(command: string): SafetyResult;
```

**Classification levels:**
- **`safe`** - Read-only and informational commands (ls, cat, git status, etc.)
- **`moderate`** - Common operations requiring awareness (npm install, git commit, mkdir)
- **`dangerous`** - Destructive operations (rm -rf, force push, chmod 777)
- **`blocked`** - Commands that never execute (rm -rf /, fork bombs, format)

---

## TUI

### startTUI

Starts the interactive terminal UI.

```typescript
function startTUI(config: Config): Promise<void>;
```

---

## Export Summary

All public exports are available from `src/index.ts`:

| Export | Type | Source |
|--------|------|--------|
| `AgentLoop` | class | `src/agent/loop.ts` |
| `AgentConfig` | interface | `src/agent/types.ts` |
| `AgentEvent` | interface | `src/agent/types.ts` |
| `AgentState` | interface | `src/agent/types.ts` |
| `RetryEventData` | interface | `src/agent/types.ts` |
| `buildSystemPrompt` | function | `src/agent/prompts.ts` |
| `loadConfig` | function | `src/config/loader.ts` |
| `getConfigDir` | function | `src/config/loader.ts` |
| `Config` | interface | `src/config/schema.ts` |
| `CredentialManager` | class | `src/config/credentials.ts` |
| `createProvider` | function | `src/providers/index.ts` |
| `createProviderFromConfig` | function | `src/providers/index.ts` |
| `BaseProvider` | abstract class | `src/providers/base.ts` |
| `ToolRegistry` | class | `src/tools/registry.ts` |
| `ToolHandler` | interface | `src/tools/registry.ts` |
| `ToolContext` | interface | `src/tools/registry.ts` |
| `createDefaultTools` | function | `src/tools/index.ts` |
| `ContextEngine` | class | `src/context/engine.ts` |
| `SessionManager` | class | `src/sessions/manager.ts` |
| `SessionStore` | class | `src/sessions/store.ts` |
| `ConversationCompactor` | class | `src/sessions/compaction.ts` |
| `PermissionManager` | class | `src/permissions/manager.ts` |
| `PermissionStore` | class | `src/permissions/store.ts` |
| `startTUI` | function | `src/tui/index.ts` |
| `Message` | interface | `src/models/provider.ts` |
| `ContentPart` | interface | `src/models/provider.ts` |
| `ToolCall` | interface | `src/models/provider.ts` |
| `ToolResult` | interface | `src/models/provider.ts` |
| `ToolDefinition` | interface | `src/models/provider.ts` |
| `CompletionRequest` | interface | `src/models/provider.ts` |
| `CompletionResponse` | interface | `src/models/provider.ts` |
| `StreamChunk` | type | `src/models/provider.ts` |
| `ModelInfo` | interface | `src/models/provider.ts` |
| `ProviderType` | type | `src/models/provider.ts` |
| `ProviderConfig` | interface | `src/models/provider.ts` |
| `resolveModelAlias` | function | `src/models/aliases.ts` |
| `MODEL_ALIASES` | const | `src/models/aliases.ts` |
| `getModel` | function | `src/models/registry.ts` |
| `listModelsByProvider` | function | `src/models/registry.ts` |
