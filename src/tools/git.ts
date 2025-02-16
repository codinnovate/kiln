import * as path from 'node:path';
import type { ToolHandler } from './registry.js';
import { executeCommand } from '../shell/executor.js';

function resolvePath(filePath: string, cwd: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(cwd, filePath);
}

async function runGit(args: string[], cwd: string): Promise<{ output: string; exitCode: number }> {
  const result = await executeCommand(`git ${args.join(' ')}`, { cwd });
  return { output: (result.stdout + result.stderr).trim(), exitCode: result.exitCode };
}

function formatGitError(output: string): string {
  if (output.includes('not a git repository') || output.includes('fatal: not a git repository')) {
    return 'Not a git repository. Initialize one with `git init` first.';
  }
  return output;
}

export const gitStatusTool: ToolHandler = {
  name: 'git_status',
  description: 'Show the working tree status in short format. Returns a list of modified, added, deleted, and untracked files.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async execute(_args, context) {
    const { output, exitCode } = await runGit(['status', '--short'], context.cwd);
    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }
    const status = output || 'No changes (clean working tree)';
    return {
      toolCallId: '',
      content: `Git status:\n\n${status}`,
      isError: false,
    };
  },
};

export const gitDiffTool: ToolHandler = {
  name: 'git_diff',
  description: 'Show changes between commits, working tree, and index. Optionally pass --staged for staged changes, or a specific file path.',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'What to diff: "staged" or "cached" for staged changes, a file path for a specific file, or empty for all unstaged changes.',
      },
    },
    additionalProperties: false,
  },
  async execute(args, context) {
    const target = (args.target as string) || '';
    const gitArgs = ['diff'];

    if (target === 'staged' || target === '--staged' || target === 'cached' || target === '--cached') {
      gitArgs.push('--staged');
    } else if (target) {
      const filePath = resolvePath(target, context.cwd);
      gitArgs.push('--', filePath);
    }

    const { output, exitCode } = await runGit(gitArgs, context.cwd);
    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }
    const diff = output || 'No changes';
    return {
      toolCallId: '',
      content: diff,
      isError: false,
    };
  },
};

export const gitLogTool: ToolHandler = {
  name: 'git_log',
  description: 'Show recent git log entries in oneline format.',
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of log entries to show. Defaults to 20.',
      },
    },
    additionalProperties: false,
  },
  async execute(args, context) {
    const count = Math.min(100, Math.max(1, (args.count as number) || 20));
    const { output, exitCode } = await runGit(
      ['log', '--oneline', `-n`, String(count)],
      context.cwd,
    );
    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }
    if (!output) {
      return { toolCallId: '', content: 'No commits yet.', isError: false };
    }
    return {
      toolCallId: '',
      content: `Recent commits:\n\n${output}`,
      isError: false,
    };
  },
};

export const gitAddTool: ToolHandler = {
  name: 'git_add',
  description: 'Stage files for the next commit. Pass specific file paths or use "." for all changes.',
  parameters: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of file paths to stage. Use ["."] for all changes.',
      },
    },
    required: ['files'],
    additionalProperties: false,
  },
  async execute(args, context) {
    const files = args.files as string[];
    if (!Array.isArray(files) || files.length === 0) {
      return { toolCallId: '', content: 'Error: files array is required', isError: true };
    }

    if (!context.permissions.approve('git-add', 'execute')) {
      return { toolCallId: '', content: 'Permission denied: git add', isError: true };
    }

    const resolvedFiles = files.map((f) => (f === '.' ? '.' : resolvePath(f, context.cwd)));
    const { output, exitCode } = await runGit(['add', ...resolvedFiles], context.cwd);

    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }

    const fileCount = files.includes('.') ? 'all changes' : `${files.length} file(s)`;
    return {
      toolCallId: '',
      content: `Staged ${fileCount} for commit.`,
      isError: false,
    };
  },
};

export const gitCommitTool: ToolHandler = {
  name: 'git_commit',
  description: 'Create a new commit with the given message. Files must be staged first.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The commit message',
      },
    },
    required: ['message'],
    additionalProperties: false,
  },
  async execute(args, context) {
    const message = args.message as string;
    if (!message || typeof message !== 'string') {
      return { toolCallId: '', content: 'Error: commit message is required', isError: true };
    }

    if (!context.permissions.approve('git-commit', 'execute')) {
      return { toolCallId: '', content: 'Permission denied: git commit', isError: true };
    }

    const { output, exitCode } = await runGit(
      ['commit', '-m', message],
      context.cwd,
    );

    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }

    return {
      toolCallId: '',
      content: `Created commit:\n${output}`,
      isError: false,
    };
  },
};

export const gitBranchTool: ToolHandler = {
  name: 'git_branch',
  description: 'List all local branches. Optionally create or delete a branch.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '"list" (default), "create", or "delete"',
      },
      name: {
        type: 'string',
        description: 'Branch name (required for create/delete)',
      },
    },
    additionalProperties: false,
  },
  async execute(args, context) {
    const action = (args.action as string) || 'list';
    const name = args.name as string | undefined;

    if ((action === 'create' || action === 'delete') && (!name || typeof name !== 'string')) {
      return { toolCallId: '', content: `Error: branch name is required for "${action}" action`, isError: true };
    }

    if (action === 'delete' && !context.permissions.approve('git-branch-delete', 'execute')) {
      return { toolCallId: '', content: 'Permission denied: git branch -D', isError: true };
    }

    let gitArgs: string[];
    switch (action) {
      case 'create':
        gitArgs = ['branch', name!];
        break;
      case 'delete':
        gitArgs = ['branch', '-D', name!];
        break;
      case 'list':
      default:
        gitArgs = ['branch'];
        break;
    }

    const { output, exitCode } = await runGit(gitArgs, context.cwd);
    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }

    const verb = action === 'create' ? 'Created' : action === 'delete' ? 'Deleted' : 'Branches';
    return {
      toolCallId: '',
      content: `${verb}:\n\n${output}`,
      isError: false,
    };
  },
};

export const gitCheckoutTool: ToolHandler = {
  name: 'git_checkout',
  description: 'Switch to a branch or restore working tree files. Pass a branch name to switch, or a file path to restore.',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Branch name to switch to, or file path to restore from HEAD',
      },
      create: {
        type: 'boolean',
        description: 'If true, create a new branch with this name and switch to it. Defaults to false.',
      },
    },
    required: ['target'],
    additionalProperties: false,
  },
  async execute(args, context) {
    const target = args.target as string;
    if (!target || typeof target !== 'string') {
      return { toolCallId: '', content: 'Error: target is required', isError: true };
    }

    if (!context.permissions.approve('git-checkout', 'execute')) {
      return { toolCallId: '', content: 'Permission denied: git checkout', isError: true };
    }

    const gitArgs = ['checkout'];
    if (args.create) {
      gitArgs.push('-b');
    }
    gitArgs.push(target);

    const { output, exitCode } = await runGit(gitArgs, context.cwd);
    if (exitCode !== 0) {
      return { toolCallId: '', content: formatGitError(output), isError: true };
    }

    return {
      toolCallId: '',
      content: `Checked out ${target}:\n\n${output || 'Switched successfully.'}`,
      isError: false,
    };
  },
};

export const gitTools: ToolHandler[] = [
  gitStatusTool,
  gitDiffTool,
  gitLogTool,
  gitAddTool,
  gitCommitTool,
  gitBranchTool,
  gitCheckoutTool,
];
