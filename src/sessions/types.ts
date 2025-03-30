import type { Message } from '../models/provider.js';

export interface SessionMetadata {
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

export interface Session {
  metadata: SessionMetadata;
  messages: Message[];
  state?: {
    totalTokens: { input: number; output: number };
    iterations: number;
  };
}
