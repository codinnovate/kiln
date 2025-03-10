import { resolve } from 'node:path';
import type { ContextBudget, ContextResult, Message, RepoInfo } from './types.js';
import { ContextBuilder } from './builder.js';
import { scanRepository } from './scanner.js';

const MAX_RECENT_FILES = 50;

export class ContextEngine {
  private cwd: string;
  private budget: Partial<ContextBudget>;
  private repoInfo?: RepoInfo;
  private recentFiles: string[] = [];
  private lastScan: number = 0;
  private scanCacheMs: number = 30_000;

  constructor(cwd: string, budget?: Partial<ContextBudget>) {
    this.cwd = resolve(cwd);
    this.budget = budget ?? {};
  }

  async initialize(): Promise<void> {
    await this.refreshRepoInfo();
  }

  async buildContext(
    messages: Message[],
    additionalFiles?: string[],
  ): Promise<ContextResult> {
    await this.ensureRepoInfo();

    const builder = new ContextBuilder(this.budget);

    if (this.repoInfo) {
      builder.addRepositoryContext(this.repoInfo);
    }

    if (this.recentFiles.length > 0) {
      builder.addRecentFiles(this.recentFiles.slice(0, 10));
    }

    builder.addConversationHistory(messages);

    if (additionalFiles && additionalFiles.length > 0) {
      const { readFile } = await import('node:fs/promises');

      for (const filePath of additionalFiles.slice(0, 10)) {
        try {
          const content = await readFile(resolve(this.cwd, filePath), 'utf-8');
          builder.addFileContent(filePath, content);
        } catch {
          // Skip unreadable files
        }
      }
    }

    return builder.build();
  }

  getRepoInfo(): RepoInfo | undefined {
    return this.repoInfo;
  }

  trackFileAccess(path: string): void {
    const normalized = resolve(this.cwd, path);

    this.recentFiles = this.recentFiles.filter((f) => resolve(this.cwd, f) !== normalized);
    this.recentFiles.unshift(path);

    if (this.recentFiles.length > MAX_RECENT_FILES) {
      this.recentFiles = this.recentFiles.slice(0, MAX_RECENT_FILES);
    }
  }

  getFileHistory(): string[] {
    return [...this.recentFiles];
  }

  async refreshRepoInfo(): Promise<void> {
    this.repoInfo = await scanRepository(this.cwd);
    this.lastScan = Date.now();
  }

  private async ensureRepoInfo(): Promise<void> {
    if (!this.repoInfo || Date.now() - this.lastScan > this.scanCacheMs) {
      await this.refreshRepoInfo();
    }
  }
}
