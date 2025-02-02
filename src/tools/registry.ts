import type { ToolCall, ToolDefinition, ToolResult } from '../models/provider.js';

export interface PermissionChecker {
  approve(path: string, action: 'read' | 'write' | 'delete' | 'execute'): boolean;
}

export interface ToolContext {
  cwd: string;
  permissions: PermissionChecker;
  onProgress?: (message: string) => void;
}

export interface ToolHandler {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();

  register(tool: ToolHandler): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  list(): ToolHandler[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): ToolDefinition[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  async execute(toolCall: ToolCall, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: `Unknown tool: ${toolCall.name}`,
        isError: true,
      };
    }

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      return {
        toolCallId: toolCall.id,
        content: `Invalid JSON arguments: ${toolCall.arguments}`,
        isError: true,
      };
    }

    try {
      return await tool.execute(args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        toolCallId: toolCall.id,
        content: `Tool execution error: ${message}`,
        isError: true,
      };
    }
  }
}
