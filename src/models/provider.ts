export interface ModelInfo {
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

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'ollama'
  | 'custom';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url' | 'tool_call' | 'tool_result';
  text?: string;
  imageUrl?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: string }
  | { type: 'done' };

export interface CompletionRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  model: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface CompletionResponse {
  message: Message;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}
