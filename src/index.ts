export { AgentLoop } from './agent/loop.js';
export type { AgentConfig, AgentEvent, AgentState } from './agent/types.js';
export { buildSystemPrompt } from './agent/prompts.js';

export { loadConfig, getConfigDir } from './config/loader.js';
export type { Config } from './config/schema.js';

export { CredentialManager } from './config/credentials.js';

export { createProvider, createProviderFromConfig } from './providers/index.js';
export type { BaseProvider } from './providers/base.js';

export { ToolRegistry } from './tools/registry.js';
export type { ToolHandler, ToolContext } from './tools/registry.js';
export { createDefaultTools } from './tools/index.js';

export { ContextEngine } from './context/engine.js';

export { SessionManager } from './sessions/manager.js';
export { SessionStore } from './sessions/store.js';
export { ConversationCompactor } from './sessions/compaction.js';

export { PermissionManager } from './permissions/manager.js';
export { PermissionStore } from './permissions/store.js';

export { startTUI } from './tui/index.js';

export * from './models/provider.js';
export { resolveModelAlias, MODEL_ALIASES } from './models/aliases.js';
export { getModel, listModelsByProvider } from './models/registry.js';
