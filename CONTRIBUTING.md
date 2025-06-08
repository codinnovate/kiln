# Contributing to Kiln

Thanks for your interest in contributing to Kiln. This guide covers the prerequisites, setup, workflow, and standards for contributions.

## Prerequisites

- Node.js >= 18
- npm >= 9
- Git

## Setup

```bash
git clone https://github.com/yourorg/kiln.git
cd kiln
npm install
```

Verify everything works:

```bash
npm run typecheck
npm run lint
npm test
```

## Development Workflow

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

### Making Changes

1. Create a branch from `main`
2. Make your changes following the coding conventions
3. Add or update tests as needed
4. Run the full check suite before committing:

```bash
npm run typecheck && npm run lint && npm test
```

5. Commit with a clear message
6. Push and open a pull request

### Running in Development

```bash
npm run dev              # Run the CLI in development mode
```

This uses `tsx` to execute the TypeScript source directly without building.

### Building

```bash
npm run build            # Build to dist/ via tsup
```

The built CLI entrypoint is `dist/cli/index.js`.

## Code Style

### TypeScript

- Strict mode is enabled. Do not disable it.
- Use ESM modules (`import`/`export`). No CommonJS (`require`).
- Always include `.js` extensions in import paths.
- Prefer `interface` over `type` for object shapes.
- Avoid `any`. Use `unknown` and narrow with type guards.
- Use Zod for runtime validation of external data.

### Naming

- `camelCase` for variables, functions, parameters
- `PascalCase` for classes, interfaces, type aliases, React components
- `UPPER_SNAKE_CASE` for constants
- File names use `kebab-case.ts` (e.g., `token-estimator.ts`)

### Formatting

Prettier configuration (in `.prettierrc`):

- Single quotes
- Trailing commas (all)
- 100 character print width
- Semicolons

Run `npm run format` to auto-format.

### Linting

ESLint is configured with `@typescript-eslint`. Key rules:

- `@typescript-eslint/no-unused-vars`: Error (with `_` prefix pattern allowed)
- `@typescript-eslint/no-explicit-any`: Warning
- `@typescript-eslint/explicit-function-return-type`: Off

Run `npm run lint` to check.

### Comments

Do not add comments to code unless the user explicitly requests them. Code should be self-documenting through clear naming and structure.

## Testing

Tests use Vitest with globals enabled (no need to import `describe`, `it`, `expect`).

### Test Organization

- `tests/unit/` - Unit tests for individual modules
- `tests/integration/` - Integration tests for combined functionality

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('MyModule', () => {
  it('should do something', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```

### Running Tests

```bash
npm test                   # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # With coverage
npm test -- path/to/test   # Run specific test file
```

### Test Conventions

- Test files use `.test.ts` extension
- Mirror the source directory structure in `tests/`
- Test behavior, not implementation details
- Use descriptive test names
- Prefer real implementations over mocks where practical
- Mock external dependencies (file system, network, child processes) at the boundary

## Pull Request Process

1. **Before opening a PR:**
   - `npm run typecheck` passes
   - `npm run lint` passes
   - `npm test` passes
   - Branch is up to date with `main`

2. **PR description should include:**
   - What changed and why
   - How to test the changes
   - Any breaking changes or migration steps

3. **Review process:**
   - At least one approval required
   - All CI checks must pass
   - Address review feedback

4. **Merging:**
   - Squash merge to keep history clean
   - Delete branch after merge

## Architecture

Before making changes, understand the module structure. See [docs/architecture.md](docs/architecture.md) for a detailed overview.

Key principles:

- **Separation of concerns** - Each module has a single responsibility
- **Provider abstraction** - LLM providers implement `BaseProvider`
- **Tool registration** - Tools implement `ToolHandler` and register with `ToolRegistry`
- **Configuration layers** - Global, project, and environment configs merge in order
- **Safety first** - Commands are classified and permissions checked before execution

## Adding a New Tool

1. Create a `ToolHandler` object in the appropriate file under `src/tools/`
2. Define `name`, `description`, `parameters` (JSON Schema), and `execute` function
3. Add it to the appropriate tools array in `src/tools/index.ts`
4. Add tests in `tests/unit/`

```typescript
const myTool: ToolHandler = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The input' },
    },
    required: ['input'],
  },
  async execute(args, context) {
    // Implementation
    return { toolCallId: '', content: 'result', isError: false };
  },
};
```

## Adding a New Provider

1. Create `src/providers/myprovider.ts` extending `BaseProvider`
2. Implement `complete()`, `stream()`, `formatMessages()`, `formatTools()`
3. Register in `src/providers/index.ts` `createProvider()` switch
4. Add provider type to `ProviderType` in `src/models/provider.ts`
5. Register models in `src/models/registry.ts`
6. Add tests

## Reporting Issues

When reporting bugs, include:

- Kiln version (`kiln --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant error messages or logs (run with `--debug`)
