import type { Message, StreamChunk, ToolCall } from '../models/provider.js';
import type { BaseProvider } from '../providers/base.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/registry.js';
import type { ContextEngine } from '../context/engine.js';
import type { PermissionManager } from '../permissions/manager.js';
import type { PermissionRequest } from '../permissions/types.js';
import type { AgentConfig, AgentEvent, AgentState, RetryEventData } from './types.js';
import type { RepoInfo } from './types.js';
import { buildSystemPrompt } from './prompts.js';
import { ConversationCompactor } from '../sessions/compaction.js';

const COMPACTION_THRESHOLD = 0.8;
const DEFAULT_CONTEXT_WINDOW = 128000;

type EventHandler = (event: AgentEvent) => void;

export class AgentLoop {
  private provider: BaseProvider;
  private tools: ToolRegistry;
  private context: ContextEngine;
  private permissions: PermissionManager;
  private config: AgentConfig;
  private state: AgentState;
  private handlers: Map<string, EventHandler[]> = new Map();
  private abortController: AbortController | null = null;
  private compactor: ConversationCompactor;

  constructor(
    provider: BaseProvider,
    tools: ToolRegistry,
    context: ContextEngine,
    permissions: PermissionManager,
    config: AgentConfig,
  ) {
    this.provider = provider;
    this.tools = tools;
    this.context = context;
    this.permissions = permissions;
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? 20,
    };
    this.state = this.createInitialState();
    this.compactor = new ConversationCompactor(provider);

    const maxRetries = config.maxRetries ?? 3;
    provider.setMaxRetries(maxRetries);
    provider.setOnRetry((attempt, maxAttempts, error) => {
      const data: RetryEventData = { attempt, maxAttempts, error };
      const event: AgentEvent = {
        type: 'retry',
        data,
        timestamp: new Date(),
      };
      this.emit(event);
    });
  }

  private createInitialState(): AgentState {
    return {
      messages: [],
      iterations: 0,
      totalTokens: { input: 0, output: 0 },
      activeTools: [],
      isComplete: true,
    };
  }

  async initialize(): Promise<void> {
    await this.context.initialize();
  }

  on(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  off(event: string, handler: EventHandler): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  private emit(event: AgentEvent): void {
    const list = this.handlers.get(event.type);
    if (list) {
      for (const handler of list) {
        handler(event);
      }
    }
    const all = this.handlers.get('*');
    if (all) {
      for (const handler of all) {
        handler(event);
      }
    }
  }

  async *chat(userMessage: string): AsyncGenerator<AgentEvent> {
    this.state.isComplete = false;
    this.abortController = new AbortController();

    const userMsg: Message = { role: 'user', content: userMessage };
    this.state.messages.push(userMsg);

    try {
      yield* this.runLoop();
    } catch (error) {
      const event: AgentEvent = {
        type: 'error',
        data: { message: error instanceof Error ? error.message : String(error) },
        timestamp: new Date(),
      };
      this.emit(event);
      yield event;
    } finally {
      this.state.isComplete = true;
      this.abortController = null;

      const doneEvent: AgentEvent = {
        type: 'done',
        data: {
          iterations: this.state.iterations,
          totalTokens: this.state.totalTokens,
        },
        timestamp: new Date(),
      };
      this.emit(doneEvent);
      yield doneEvent;
    }
  }

  private async *runLoop(): AsyncGenerator<AgentEvent> {
    while (this.state.iterations < this.config.maxIterations) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      this.state.iterations++;

      const maxRetries = this.config.maxRetries ?? 3;
      let iterationError: string | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const retryData: RetryEventData = {
            attempt,
            maxAttempts: maxRetries,
            error: iterationError ?? 'Unknown error',
          };
          const retryEvent: AgentEvent = {
            type: 'retry',
            data: retryData,
            timestamp: new Date(),
          };
          this.emit(retryEvent);
          yield retryEvent;
        }

        iterationError = null;
        const messages = await this.buildMessages();
        const toolDefs = this.tools.getDefinitions();

        let textContent = '';
        const toolCalls: ToolCall[] = [];

        for await (const chunk of this.streamCompletion(messages, toolDefs)) {
          switch (chunk.type) {
            case 'text_delta':
              textContent += chunk.text;
              const textEvent: AgentEvent = {
                type: 'text',
                data: { text: chunk.text, accumulated: textContent },
                timestamp: new Date(),
              };
              this.emit(textEvent);
              yield textEvent;
              break;

            case 'tool_call':
              toolCalls.push(chunk.toolCall);
              const callEvent: AgentEvent = {
                type: 'tool_call',
                data: {
                  id: chunk.toolCall.id,
                  name: chunk.toolCall.name,
                  arguments: chunk.toolCall.arguments,
                },
                timestamp: new Date(),
              };
              this.emit(callEvent);
              yield callEvent;
              break;

            case 'usage':
              this.state.totalTokens.input += chunk.inputTokens;
              this.state.totalTokens.output += chunk.outputTokens;
              const usageEvent: AgentEvent = {
                type: 'usage',
                data: { ...this.state.totalTokens },
                timestamp: new Date(),
              };
              this.emit(usageEvent);
              yield usageEvent;
              break;

            case 'error': {
              iterationError = chunk.error;
              break;
            }

            case 'done':
              break;
          }

          if (iterationError) break;
        }

        if (!iterationError) {
          const assistantMsg: Message = {
            role: 'assistant',
            content: textContent,
          };
          if (toolCalls.length > 0) {
            assistantMsg.toolCalls = toolCalls;
          }
          this.state.messages.push(assistantMsg);

          if (toolCalls.length === 0) {
            return;
          }

          yield* this.handleToolCalls(toolCalls);

          yield* this.compactIfNeeded();
          break;
        }
      }

      if (iterationError) {
        const errEvent: AgentEvent = {
          type: 'error',
          data: { message: iterationError },
          timestamp: new Date(),
        };
        this.emit(errEvent);
        yield errEvent;
        return;
      }
    }

    if (this.state.iterations >= this.config.maxIterations) {
      const warnEvent: AgentEvent = {
        type: 'error',
        data: {
          message: `Reached maximum iterations (${this.config.maxIterations}). Stopping.`,
        },
        timestamp: new Date(),
      };
      this.emit(warnEvent);
      yield warnEvent;
    }
  }

  private async *compactIfNeeded(): AsyncGenerator<AgentEvent> {
    if (!this.config.compact) return;
    if (this.state.messages.length < 10) return;

    const contextWindow = this.config.maxTokens ?? DEFAULT_CONTEXT_WINDOW;
    const targetTokens = Math.floor(contextWindow * COMPACTION_THRESHOLD);

    const result = await this.compactor.compact(this.state.messages, targetTokens);

    if (result.tokenSavings > 0) {
      this.state.messages = result.messages;

      const compactionEvent: AgentEvent = {
        type: 'compaction',
        data: {
          summary: result.summary,
          tokenSavings: result.tokenSavings,
          messageCount: this.state.messages.length,
        },
        timestamp: new Date(),
      };
      this.emit(compactionEvent);
      yield compactionEvent;
    }
  }

  private async *streamCompletion(
    messages: Message[],
    tools: import('../models/provider.js').ToolDefinition[],
  ): AsyncGenerator<StreamChunk> {
    yield* this.provider.stream({
      messages,
      tools: tools.length > 0 ? tools : undefined,
      model: this.config.model,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      stream: true,
    });
  }

  private async *handleToolCalls(toolCalls: ToolCall[]): AsyncGenerator<AgentEvent> {
    const toolContext = this.buildToolContext();

    for (const toolCall of toolCalls) {
      if (this.abortController?.signal.aborted) break;

      this.state.activeTools.push(toolCall.name);

      const permissionRequest = this.buildPermissionRequest(toolCall);
      if (permissionRequest) {
        const permEvent: AgentEvent = {
          type: 'permission_request',
          data: {
            tool: toolCall.name,
            request: permissionRequest,
          },
          timestamp: new Date(),
        };
        this.emit(permEvent);
        yield permEvent;

        const decision = await this.permissions.check(permissionRequest);
        if (decision.action === 'deny') {
          const denyResult: Message = {
            role: 'tool',
            content: `Permission denied for ${toolCall.name}.`,
            toolCallId: toolCall.id,
          };
          this.state.messages.push(denyResult);

          const resultEvent: AgentEvent = {
            type: 'tool_result',
            data: {
              id: toolCall.id,
              name: toolCall.name,
              content: 'Permission denied.',
              isError: true,
            },
            timestamp: new Date(),
          };
          this.emit(resultEvent);
          yield resultEvent;

          this.state.activeTools = this.state.activeTools.filter((t) => t !== toolCall.name);
          continue;
        }
      }

      const result = await this.tools.execute(toolCall, toolContext);

      const toolResultMsg: Message = {
        role: 'tool',
        content: result.content,
        toolCallId: result.toolCallId,
      };
      this.state.messages.push(toolResultMsg);

      const resultEvent: AgentEvent = {
        type: 'tool_result',
        data: {
          id: toolCall.id,
          name: toolCall.name,
          content: result.content,
          isError: result.isError,
        },
        timestamp: new Date(),
      };
      this.emit(resultEvent);
      yield resultEvent;

      this.state.activeTools = this.state.activeTools.filter((t) => t !== toolCall.name);
    }
  }

  private async buildMessages(): Promise<Message[]> {
    const messages: Message[] = [];

    const repoInfo = this.context.getRepoInfo();
    const systemPrompt = buildSystemPrompt(
      this.config,
      repoInfo as RepoInfo | undefined,
    );
    messages.push({ role: 'system', content: systemPrompt });

    const contextResult = await this.context.buildContext(this.state.messages);

    for (const entry of contextResult.entries) {
      if (entry.type === 'instruction' || entry.type === 'config') {
        const exists = messages.some(
          (m) =>
            m.role === 'system' &&
            typeof m.content === 'string' &&
            m.content.includes(entry.content),
        );
        if (!exists) {
          messages.push({ role: 'system', content: entry.content });
        }
      }
    }

    messages.push(...this.state.messages);

    return messages;
  }

  private buildToolContext(): ToolContext {
    return {
      cwd: this.config.cwd,
      permissions: {
        approve: (path, action) => {
          const request: PermissionRequest = {
            type:
              action === 'execute'
                ? 'command'
                : action === 'delete'
                  ? 'file_delete'
                  : 'file_write',
            target: path,
            description: `${action} on ${path}`,
            safety: 'moderate',
          };
          return this.permissions.isAlwaysAllowed(request);
        },
      },
      onProgress: (message) => {
        const event: AgentEvent = {
          type: 'thinking',
          data: { message },
          timestamp: new Date(),
        };
        this.emit(event);
      },
    };
  }

  private buildPermissionRequest(toolCall: ToolCall): PermissionRequest | null {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.arguments);
    } catch {
      return null;
    }

    if (toolCall.name === 'execute' || toolCall.name === 'run_command') {
      const command = (args.command ?? args.cmd ?? args.input) as string | undefined;
      if (command) {
        return {
          type: 'command',
          target: command,
          description: `Run command: ${command}`,
          safety: 'moderate',
        };
      }
    }

    if (
      toolCall.name === 'write_file' ||
      toolCall.name === 'create_file'
    ) {
      const filePath = (args.path ?? args.file_path ?? args.filePath) as string | undefined;
      if (filePath) {
        return {
          type: 'file_write',
          target: filePath,
          description: `Write to file: ${filePath}`,
          safety: 'moderate',
        };
      }
    }

    if (toolCall.name === 'delete_file' || toolCall.name === 'remove_file') {
      const filePath = (args.path ?? args.file_path ?? args.filePath) as string | undefined;
      if (filePath) {
        return {
          type: 'file_delete',
          target: filePath,
          description: `Delete file: ${filePath}`,
          safety: 'dangerous',
        };
      }
    }

    return null;
  }

  getState(): AgentState {
    return { ...this.state, messages: [...this.state.messages] };
  }

  getMessages(): Message[] {
    return [...this.state.messages];
  }

  reset(): void {
    this.state = this.createInitialState();
    this.abortController = null;
  }

  abort(): void {
    this.abortController?.abort();
  }
}
