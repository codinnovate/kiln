# Tool System

Kiln's tool system allows the AI agent to interact with your project through a structured interface. This document covers the built-in tools, the tool interface, and how to add custom tools.

## Built-in Tools

### Filesystem Tools

#### `read_file`

Read file contents with line numbers.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute or relative file path |
| `offset` | number | No | Line to start from (1-indexed, default: 1) |
| `limit` | number | No | Max lines to read (default: 2000) |

Features:
- Binary file detection (returns error for binary files)
- Output truncation for large files
- File size and line count in header

#### `write_file`

Create or overwrite a file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute or relative file path |
| `content` | string | Yes | Content to write |

Features:
- Auto-creates parent directories
- Reports line count and byte size after writing

#### `edit_file`

Search-and-replace edits within a file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute or relative file path |
| `edits` | array | Yes | Array of `{search, replace}` pairs |

Each edit performs an exact string match. Fails if:
- Search string is not found
- Search string matches multiple locations (provide more context to disambiguate)

Edits are applied sequentially in order.

#### `delete_file`

Delete a file permanently.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute or relative file path |

Returns error for directories. Requires `rm` permission for the path.

#### `list_directory`

List directory contents with metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Directory path (default: cwd) |
| `showHidden` | boolean | No | Include dotfiles (default: false) |

Returns entries sorted directories-first, each with type indicator (`/` for directories, `@` for symlinks) and human-readable size.

#### `search_files`

Regex search across file contents.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | Regular expression pattern |
| `path` | string | No | Directory to search (default: cwd) |
| `include` | string | No | Glob filter (e.g., `*.ts`) |

Returns matching lines with file paths, line numbers, and surrounding context (3 lines above/below). Limited to 200 matches.

#### `glob_files`

Find files matching glob patterns.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | Glob pattern (e.g., `src/**/*.ts`) |
| `path` | string | No | Base directory (default: cwd) |

Supports `*`, `**`, `?`, and `{a,b}` alternatives. Returns paths relative to cwd. Limited to 5000 results.

#### `get_file_info`

Get file or directory metadata.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute or relative path |

Returns type, size, modified date, created date, permissions (octal), owner UID, group GID, and extension.

### Shell Tools

#### `run_command`

Execute a shell command.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | Yes | Shell command to execute |
| `timeout` | number | No | Timeout in ms (default: 30000) |
| `cwd` | string | No | Working directory (default: project root) |

Features:
- Automatic safety classification (safe/moderate/dangerous/blocked)
- Output capture (stdout + stderr)
- Exit code reporting
- Timeout with graceful kill (SIGTERM → SIGKILL after 5s)
- Output truncation (max 50KB)
- Duration reporting

Blocked commands are rejected immediately. Dangerous and moderate commands require permission.

### Git Tools

#### `git_status`

Show working tree status in short format.

No parameters. Returns list of modified, added, deleted, and untracked files.

#### `git_diff`

Show changes between commits and working tree.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | No | `"staged"` for staged changes, file path for specific file, empty for all unstaged |

#### `git_log`

Show recent commits in oneline format.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `count` | number | No | Number of entries (default: 20, max: 100) |

#### `git_add`

Stage files for commit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | string[] | Yes | File paths to stage. Use `["."]` for all changes. |

Requires permission.

#### `git_commit`

Create a commit.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | Yes | Commit message |

Files must be staged first. Requires permission.

#### `git_branch`

Manage branches.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | No | `"list"` (default), `"create"`, or `"delete"` |
| `name` | string | No | Branch name (required for create/delete) |

Delete requires permission.

#### `git_checkout`

Switch branches or restore files.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | Yes | Branch name or file path to restore |
| `create` | boolean | No | Create new branch and switch (default: false) |

Requires permission.

## Tool Interface

Every tool implements the `ToolHandler` interface:

```typescript
interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult>;
}
```

### ToolContext

The context object passed to every tool execution:

```typescript
interface ToolContext {
  cwd: string;                    // Current working directory
  permissions: PermissionChecker;  // Permission checking interface
  onProgress?: (message: string) => void;  // Progress reporting callback
}
```

### ToolResult

Every tool returns:

```typescript
interface ToolResult {
  toolCallId: string;   // Matches the incoming tool call ID
  content: string;      // Text result to send back to the LLM
  isError: boolean;     // Whether this is an error result
}
```

### Tool Definition

Tools are defined for the LLM using JSON Schema:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema object
}
```

## Adding Custom Tools

### Step 1: Create the Tool

Create a new file in `src/tools/` or add to an existing file:

```typescript
import type { ToolHandler } from './registry.js';

export const myCustomTool: ToolHandler = {
  name: 'my_custom_tool',
  description: 'Description of what this tool does. Be specific about when to use it.',
  parameters: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'The input parameter',
      },
      options: {
        type: 'object',
        properties: {
          verbose: {
            type: 'boolean',
            description: 'Enable verbose output',
          },
        },
      },
    },
    required: ['input'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const input = args.input as string;
    const verbose = (args.options as Record<string, unknown>)?.verbose as boolean ?? false;

    // Check permissions if needed
    if (!context.permissions.approve(input, 'read')) {
      return {
        toolCallId: '',
        content: `Permission denied for: ${input}`,
        isError: true,
      };
    }

    // Report progress
    context.onProgress?.(`Processing: ${input}`);

    try {
      // Your implementation here
      const result = `Processed: ${input}`;

      return {
        toolCallId: '',
        content: result,
        isError: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        toolCallId: '',
        content: `Error: ${message}`,
        isError: true,
      };
    }
  },
};
```

### Step 2: Register the Tool

Add your tool to the appropriate tools array in `src/tools/index.ts`:

```typescript
import { myCustomTool } from './my-tool.js';

export function createDefaultTools(): ToolRegistry {
  const registry = new ToolRegistry();

  // Existing tools...
  for (const tool of filesystemTools) {
    registry.register(tool);
  }

  // Your custom tool
  registry.register(myCustomTool);

  return registry;
}
```

### Step 3: Add Tests

Create a test file in `tests/unit/`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myCustomTool } from '../../src/tools/my-tool.js';

describe('myCustomTool', () => {
  it('should have correct name and description', () => {
    expect(myCustomTool.name).toBe('my_custom_tool');
    expect(myCustomTool.description).toBeTruthy();
  });

  it('should have valid JSON Schema parameters', () => {
    expect(myCustomTool.parameters).toHaveProperty('type', 'object');
    expect(myCustomTool.parameters).toHaveProperty('properties');
  });

  it('should execute successfully', async () => {
    const context = {
      cwd: '/tmp',
      permissions: {
        approve: () => true,
      },
    };

    const result = await myCustomTool.execute({ input: 'test' }, context);
    expect(result.isError).toBe(false);
    expect(result.content).toContain('Processed');
  });
});
```

## Tool Registry

The `ToolRegistry` manages all registered tools:

```typescript
class ToolRegistry {
  register(tool: ToolHandler): void;          // Register a tool
  get(name: string): ToolHandler | undefined; // Get tool by name
  list(): ToolHandler[];                      // List all tools
  getDefinitions(): ToolDefinition[];         // Get LLM-ready definitions
  execute(toolCall: ToolCall, context: ToolContext): Promise<ToolResult>;
}
```

The registry handles:
- Looking up tools by name
- Parsing JSON arguments from the LLM
- Error handling and wrapping
- Returning consistent error results for unknown tools

## Permission Integration

Tools can use the permission checker for safety:

```typescript
// Check read permission
if (!context.permissions.approve(filePath, 'read')) {
  return { toolCallId: '', content: 'Permission denied', isError: true };
}

// Check write permission
if (!context.permissions.approve(filePath, 'write')) {
  return { toolCallId: '', content: 'Permission denied', isError: true };
}

// Check execute permission
if (!context.permissions.approve(command, 'execute')) {
  return { toolCallId: '', content: 'Permission denied', isError: true };
}

// Check delete permission
if (!context.permissions.approve(filePath, 'delete')) {
  return { toolCallId: '', content: 'Permission denied', isError: true };
}
```

The agent loop also performs its own permission checks for certain tool calls (write_file, delete_file, execute) before passing them to the tool. This provides a two-layer safety system.
