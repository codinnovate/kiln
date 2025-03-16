import type { Message } from '../models/provider.js';

export interface AgentConfig {
  model: string;
  provider: string;
  cwd: string;
  maxIterations: number;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  debug?: boolean;
}

export interface AgentEvent {
  type:
    | 'text'
    | 'tool_call'
    | 'tool_result'
    | 'thinking'
    | 'error'
    | 'done'
    | 'usage'
    | 'permission_request';
  data: unknown;
  timestamp: Date;
}

export interface AgentState {
  messages: Message[];
  iterations: number;
  totalTokens: { input: number; output: number };
  activeTools: string[];
  isComplete: boolean;
}

export interface RepoInfo {
  root: string;
  languages: Record<string, number>;
  totalFiles: number;
}
