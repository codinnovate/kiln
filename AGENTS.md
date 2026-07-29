# AGENTS.md - Kiln Project Memory

## Project Overview

Kiln is a terminal coding agent written in TypeScript. It provides AI-assisted software engineering through a CLI interface with multi-model support, file editing, shell execution, git integration, and a safety-first permission system. The project uses ESM modules, Commander for CLI parsing, React/Ink for the terminal UI, and Vitest for testing.

## Architecture

The project follows a modular architecture with clear separation of concerns:

```
src/
├── agent/          Core agent loop - orchestrates LLM interactions and tool calls
├── cli/            Commander-based CLI entrypoint and subcommands
├── config/         Configuration loading (global, project, credentials) with Zod schemas
├── context/        Context engine - token budgeting, repo scanning, message management
├── models/         Model registry (hardcoded), aliases, and type definitions
├── permissions/    Permission system - approval prompts, persistent store, wildcards
├── providers/      LLM provider implementations (OpenAI, Anthropic, Google, etc.)
├── sessions/       Session persistence, history, and conversation compaction
├── shell/          Command execution with safety classification (4 levels)
├── tools/          Tool definitions (filesystem, shell, git) and registry
├── tui/            React/Ink terminal UI with streaming output
└── utils/          Shared utilities
```

### Key Data Flow

1. User input → `cli/` parses commands → `tui/` renders the interface
2. User message → `agent/loop.ts` processes through the agent loop
3. Agent loop → `context/engine.ts` builds context with token budget
4. Agent loop → `providers/*.ts` sends messages to LLM
5. LLM response → `tools/registry.ts` executes tool calls
6. Tool execution → `permissions/manager.ts` checks safety
7. Results → `sessions/manager.ts` persists conversation

## Current Status

### What Works
- Full agent loop with streaming responses
- All 6 provider implementations (OpenAI, Anthropic, Google, OpenRouter, Ollama, Custom)
- All 15+ built-in tools (filesystem, shell, git)
- Permission system with session and persistent approval
- Session persistence and resume
- Context engine with token estimation and AGENTS.md auto-loading
- Conversation compaction (wired into agent loop, triggered at 80% context usage)
- Command safety classification (4 levels)
- React/Ink TUI with components
- Model registry with aliases
- Configuration system (global + project + env)
- Credential management with file permissions
- CI/CD pipeline (Node 22, typecheck, lint, test, build)
- Provider unit tests covering all implementations

### In Progress / Not Yet Complete
- TUI component polish and edge cases
- Integration test coverage (only agent-loop.test.ts)
- Session resume from TUI
- Error recovery and retry logic
- CLI unit tests

## Commands

```bash
npm run build        # Build with tsup (output to dist/)
npm run dev          # Run dev mode via tsx
npm test             # Run Vitest tests (822 tests)
npm run lint         # ESLint on src/
npm run typecheck    # tsc --noEmit
npm run format       # Prettier format all src/
```

## Coding Conventions

- **Language**: TypeScript 5.7+ with strict mode, ESM modules (`"type": "module"`)
- **Module resolution**: NodeNext (`"module": "NodeNext"`)
- **Imports**: Always use `.js` extensions in import paths (ESM requirement)
- **Exports**: Prefer named exports; barrel exports via `index.ts` files
- **Naming**: camelCase for variables/functions, PascalCase for classes/types/interfaces, UPPER_SNAKE_CASE for constants
- **Error handling**: Use `ProviderError` for provider errors; wrap unknown errors with context
- **Types**: Prefer interfaces over type aliases for object shapes; use Zod for runtime validation
- **Formatting**: Prettier with single quotes, trailing commas, 100 char width, semicolons
- **Linting**: ESLint with `@typescript-eslint` rules; `no-explicit-any` is warning level
- **Testing**: Vitest with globals enabled; tests in `tests/unit/` and `tests/integration/`
- **File naming**: kebab-case for files, matching the module name
- **No comments**: Do not add comments unless explicitly requested
- **React/Ink**: Functional components with hooks; no class components

## Important Files

| File | Purpose |
|------|---------|
| `src/agent/loop.ts` | Core agent loop - the main orchestration logic |
| `src/agent/prompts.ts` | System prompt construction |
| `src/providers/base.ts` | Abstract base class for all providers |
| `src/providers/index.ts` | Provider factory and resolution logic |
| `src/tools/registry.ts` | Tool registration and execution |
| `src/context/engine.ts` | Context building and token budgeting |
| `src/context/builder.ts` | Context entry construction and prioritization |
| `src/config/schema.ts` | Zod schemas for all configuration |
| `src/config/loader.ts` | Config file discovery and loading |
| `src/permissions/manager.ts` | Permission checking logic |
| `src/permissions/store.ts` | Persistent permission storage |
| `src/sessions/manager.ts` | Session lifecycle management |
| `src/shell/safety.ts` | Command safety classification |
| `src/models/registry.ts` | Hardcoded model definitions |
| `src/tui/App.tsx` | Main TUI application component |
| `src/cli/index.ts` | CLI entrypoint with Commander |
| `package.json` | Project metadata and dependencies |
| `tsup.config.ts` | Build configuration for tsup bundler |
| `.github/workflows/ci.yml` | CI pipeline (Node 22, typecheck, lint, test, build)

## Current Task

Phase 3: Polish - Quality, performance, and documentation.

## Next Tasks

- Phase 3: Polish
  - Integration test coverage
  - CLI unit tests
  - Performance optimization
  - TUI component polish
- Phase 4: Release
  - Beta testing
  - v1.0.0 release

## Known Issues

- `src/commands/` directory is empty (commands are in `src/cli/commands/`)
- `src/filesystem/` and `src/git/` directories are empty (logic lives in `src/tools/`)
- `src/utils/` directory is empty
- Compaction summary uses hardcoded model (`openai/gpt-4o-mini`)
- Token estimation is approximate (chars-per-token heuristic)
- `extractToolResults` doesn't propagate `msg.toolCallId` for string content (affects OpenAI and Anthropic tool role formatting)

## Decisions Made

1. **ESM-only**: No CommonJS support. All imports use `.js` extensions.
2. **Hardcoded model registry**: Models are defined in `src/models/registry.ts` rather than fetched from APIs.
3. **Zod for validation**: Runtime config validation uses Zod schemas.
4. **React/Ink for TUI**: Terminal UI built with React and Ink for component-based rendering.
5. **4-level safety**: Commands classified as safe/moderate/dangerous/blocked.
6. **File-based sessions**: Sessions stored as JSON files in `~/.kiln/sessions/`.
7. **File-based permissions**: Permission store in `~/.kiln/permissions.json`.
8. **tsup for bundling**: Single-file output via tsup.

## Do Not Break

- `src/agent/loop.ts` `chat()` method signature and AsyncGenerator pattern
- `src/providers/base.ts` `BaseProvider` abstract class interface
- `src/tools/registry.ts` `ToolHandler` interface
- `src/config/schema.ts` Zod schemas (Config, GlobalConfig, ProjectConfig)
- `src/models/provider.ts` Message, ToolCall, ToolResult types
- ESM module system (no CommonJS)
- `.js` import extensions
- TypeScript strict mode

## Session Handoff

When resuming work on kiln:

1. Read this AGENTS.md first for current state
2. Run `npm run typecheck` to verify no type errors
3. Run `npm run lint` to check code style
4. Run `npm test` to verify tests pass
5. Check the "Current Task" and "Next Tasks" sections
6. Review "Known Issues" before making changes
7. Respect "Do Not Break" list - these are critical interfaces
8. Follow "Coding Conventions" strictly
9. Update this file when making significant changes
