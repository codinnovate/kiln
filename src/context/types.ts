import type { Message, ToolResult } from '../models/provider.js';

export interface ContextEntry {
  type: 'file' | 'directory' | 'git' | 'config' | 'instruction' | 'history' | 'tool_result';
  content: string;
  tokenEstimate: number;
  priority: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface ContextBudget {
  maxTokens: number;
  reservedForResponse: number;
  reservedForSystem: number;
  availableForContext: number;
}

export interface ContextResult {
  entries: ContextEntry[];
  totalTokens: number;
  droppedEntries: string[];
  warnings: string[];
}

export interface RepoInfo {
  root: string;
  files: FileInfo[];
  packageJson?: Record<string, unknown>;
  gitStatus?: string;
  recentCommits?: string[];
  languages: Record<string, number>;
  totalFiles: number;
  totalSize: number;
}

export interface FileInfo {
  path: string;
  size: number;
  type: 'file' | 'directory';
  extension: string;
  lastModified: Date;
  language?: string;
}

export { Message, ToolResult };
