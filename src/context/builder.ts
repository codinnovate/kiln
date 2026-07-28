import type {
  ContextEntry,
  ContextBudget,
  ContextResult,
  RepoInfo,
  Message,
  ToolResult,
} from './types.js';
import { estimateTokens, truncateToTokens } from './token-estimator.js';

const DEFAULT_BUDGET: ContextBudget = {
  maxTokens: 128000,
  reservedForResponse: 4096,
  reservedForSystem: 2048,
  availableForContext: 121856,
};

function messageToString(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;

  const parts: string[] = [];
  for (const part of msg.content) {
    if (part.type === 'text' && part.text) {
      parts.push(part.text);
    } else if (part.type === 'tool_call' && part.toolCall) {
      parts.push(`[Tool Call: ${part.toolCall.name}(${part.toolCall.arguments})]`);
    } else if (part.type === 'tool_result' && part.toolResult) {
      parts.push(`[Tool Result: ${part.toolResult.content}]`);
    }
  }
  return parts.join('\n');
}

export class ContextBuilder {
  private budget: ContextBudget;
  private entries: ContextEntry[] = [];

  constructor(budget?: Partial<ContextBudget>) {
    this.budget = {
      ...DEFAULT_BUDGET,
      ...budget,
    };
    this.budget.availableForContext =
      this.budget.maxTokens - this.budget.reservedForResponse - this.budget.reservedForSystem;
  }

  addSystemPrompt(prompt: string): this {
    this.entries.push({
      type: 'config',
      content: prompt,
      tokenEstimate: estimateTokens(prompt),
      priority: 1000,
      source: 'system',
      metadata: { category: 'system_prompt' },
    });
    return this;
  }

  addProjectInstructions(instructions: string): this {
    this.entries.push({
      type: 'instruction',
      content: instructions,
      tokenEstimate: estimateTokens(instructions),
      priority: 900,
      source: 'project',
      metadata: { category: 'instructions' },
    });
    return this;
  }

  addConversationHistory(messages: Message[]): this {
    const recent = messages.slice(-50);
    const older = messages.slice(0, -50);

    if (older.length > 0) {
      const summarized = older.map((m) => `[${m.role}] ${messageToString(m)}`).join('\n');
      const summary = `[Earlier conversation summary]\n${summarized.slice(0, 2000)}`;

      this.entries.push({
        type: 'history',
        content: summary,
        tokenEstimate: estimateTokens(summary),
        priority: 100,
        source: 'conversation',
        metadata: { category: 'history_summary', messageCount: older.length },
      });
    }

    for (let i = 0; i < recent.length; i++) {
      const msg = recent[i];
      const content = messageToString(msg);

      if (!content.trim()) continue;

      const age = recent.length - i;
      const priority = Math.max(200, 800 - age * 15);

      this.entries.push({
        type: 'history',
        content: `[${msg.role}] ${content}`,
        tokenEstimate: estimateTokens(content),
        priority,
        source: 'conversation',
        metadata: { category: 'message', role: msg.role, age },
      });
    }

    return this;
  }

  addRepositoryContext(repoInfo: RepoInfo): this {
    const sections: string[] = [];

    sections.push(`Repository: ${repoInfo.root}`);
    sections.push(`Total files: ${repoInfo.totalFiles}`);
    sections.push(`Total size: ${(repoInfo.totalSize / 1024).toFixed(1)} KB`);

    if (Object.keys(repoInfo.languages).length > 0) {
      const langStr = Object.entries(repoInfo.languages)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, count]) => `${lang}: ${count}`)
        .join(', ');
      sections.push(`Languages: ${langStr}`);
    }

    if (repoInfo.packageJson) {
      const pkg = repoInfo.packageJson;
      if (typeof pkg.name === 'string') sections.push(`Package: ${pkg.name}`);
      if (typeof pkg.description === 'string') sections.push(`Description: ${pkg.description}`);
      if (typeof pkg.version === 'string') sections.push(`Version: ${pkg.version}`);

      if (pkg.dependencies && typeof pkg.dependencies === 'object') {
        const deps = Object.keys(pkg.dependencies as Record<string, unknown>);
        if (deps.length > 0) {
          sections.push(`Dependencies (${deps.length}): ${deps.slice(0, 30).join(', ')}${deps.length > 30 ? '...' : ''}`);
        }
      }
      if (pkg.devDependencies && typeof pkg.devDependencies === 'object') {
        const devDeps = Object.keys(pkg.devDependencies as Record<string, unknown>);
        if (devDeps.length > 0) {
          sections.push(`DevDependencies (${devDeps.length}): ${devDeps.slice(0, 20).join(', ')}${devDeps.length > 20 ? '...' : ''}`);
        }
      }
      if (pkg.scripts && typeof pkg.scripts === 'object') {
        const scripts = Object.keys(pkg.scripts as Record<string, unknown>);
        if (scripts.length > 0) {
          sections.push(`Scripts: ${scripts.join(', ')}`);
        }
      }
    }

    if (repoInfo.gitStatus) {
      const statusLines = repoInfo.gitStatus.split('\n').filter(Boolean);
      if (statusLines.length > 0) {
        sections.push(`\nGit status (${statusLines.length} changes):`);
        for (const line of statusLines.slice(0, 20)) {
          sections.push(`  ${line}`);
        }
        if (statusLines.length > 20) {
          sections.push(`  ... and ${statusLines.length - 20} more`);
        }
      }
    }

    if (repoInfo.recentCommits && repoInfo.recentCommits.length > 0) {
      sections.push(`\nRecent commits:`);
      for (const commit of repoInfo.recentCommits.slice(0, 10)) {
        sections.push(`  ${commit}`);
      }
    }

    const topFiles = repoInfo.files
      .filter((f) => f.type === 'file' && f.size > 0)
      .sort((a, b) => b.size - a.size)
      .slice(0, 15);

    if (topFiles.length > 0) {
      sections.push(`\nNotable files:`);
      for (const file of topFiles) {
        const sizeKb = (file.size / 1024).toFixed(1);
        sections.push(`  ${file.path} (${sizeKb} KB, ${file.language || 'unknown'})`);
      }
    }

    const content = sections.join('\n');

    this.entries.push({
      type: 'directory',
      content,
      tokenEstimate: estimateTokens(content),
      priority: 700,
      source: 'repository',
      metadata: { category: 'repo_overview' },
    });

    return this;
  }

  addFileContent(path: string, content: string, priority: number = 500): this {
    const truncated = truncateToTokens(content, Math.floor(this.budget.availableForContext * 0.3), path);
    const tokenEstimate = estimateTokens(truncated, path);

    this.entries.push({
      type: 'file',
      content: truncated,
      tokenEstimate,
      priority,
      source: path,
      metadata: { category: 'file_content', originalSize: content.length },
    });

    return this;
  }

  addGitDiff(diff: string): this {
    this.entries.push({
      type: 'git',
      content: diff,
      tokenEstimate: estimateTokens(diff),
      priority: 600,
      source: 'git',
      metadata: { category: 'git_diff' },
    });

    return this;
  }

  addToolResult(result: ToolResult): this {
    const content = result.content;
    const truncated = truncateToTokens(content, Math.floor(this.budget.availableForContext * 0.2));

    this.entries.push({
      type: 'tool_result',
      content: truncated,
      tokenEstimate: estimateTokens(truncated),
      priority: 300,
      source: `tool:${result.toolCallId}`,
      metadata: {
        category: 'tool_result',
        toolCallId: result.toolCallId,
        isError: result.isError,
        originalSize: content.length,
      },
    });

    return this;
  }

  addRecentFiles(files: string[]): this {
    if (files.length === 0) return this;

    const content = `Recently accessed files:\n${files.map((f) => `  ${f}`).join('\n')}`;

    this.entries.push({
      type: 'file',
      content,
      tokenEstimate: estimateTokens(content),
      priority: 400,
      source: 'recent_files',
      metadata: { category: 'recent_files' },
    });

    return this;
  }

  build(): ContextResult {
    this.entries.sort((a, b) => b.priority - a.priority);

    let totalTokens = 0;
    const included: ContextEntry[] = [];
    const droppedEntries: string[] = [];
    const warnings: string[] = [];
    const budget = this.budget.availableForContext;

    for (const entry of this.entries) {
      if (totalTokens + entry.tokenEstimate <= budget) {
        included.push(entry);
        totalTokens += entry.tokenEstimate;
      } else {
        if (entry.tokenEstimate > budget - totalTokens) {
          let allRemainingDropped = true;
          for (let j = this.entries.indexOf(entry) + 1; j < this.entries.length; j++) {
            const next = this.entries[j];
            if (next.priority === entry.priority) { allRemainingDropped = false; break; }
            if (next.tokenEstimate <= budget - totalTokens) { allRemainingDropped = false; break; }
          }
          if (allRemainingDropped && entry.priority < 600) break;
        }

        droppedEntries.push(`${entry.source} (${entry.metadata?.category || entry.type})`);

        if (entry.priority >= 600) {
          warnings.push(
            `High-priority entry dropped: ${entry.source} (${entry.tokenEstimate} tokens)`,
          );
        }
      }
    }

    if (totalTokens < this.budget.availableForContext * 0.5) {
      warnings.push(
        `Context usage is low: ${totalTokens}/${this.budget.availableForContext} tokens. Consider adding more context.`,
      );
    }

    if (totalTokens > this.budget.availableForContext * 0.9) {
      warnings.push(
        `Context usage is high: ${totalTokens}/${this.budget.availableForContext} tokens.`,
      );
    }

    return {
      entries: included,
      totalTokens,
      droppedEntries,
      warnings,
    };
  }
}
