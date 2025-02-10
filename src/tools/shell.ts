import type { ToolHandler } from './registry.js';
import { executeCommand, type ExecResult } from '../shell/executor.js';
import { classifyCommand, type CommandSafety } from '../shell/safety.js';

const SAFETY_LABELS: Record<CommandSafety, string> = {
  safe: '[SAFE]',
  moderate: '[MODERATE]',
  dangerous: '[DANGEROUS]',
  blocked: '[BLOCKED]',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatResult(
  command: string,
  result: ExecResult,
  safetyLevel: CommandSafety,
): string {
  const parts: string[] = [];

  parts.push(`${SAFETY_LABELS[safetyLevel]} Command: ${command}`);
  parts.push(`Duration: ${formatDuration(result.duration)}`);
  parts.push(`Exit code: ${result.exitCode}`);
  parts.push('');

  if (result.stdout) {
    parts.push('stdout:');
    parts.push(result.stdout);
  }

  if (result.stderr) {
    if (result.stdout) parts.push('');
    parts.push('stderr:');
    parts.push(result.stderr);
  }

  if (result.timedOut) {
    parts.push('');
    parts.push('WARNING: Command timed out and was terminated.');
  }

  if (!result.stdout && !result.stderr) {
    parts.push('(no output)');
  }

  return parts.join('\n');
}

export const runCommandTool: ToolHandler = {
  name: 'run_command',
  description:
    'Execute a shell command and return its output. Commands are classified by safety level. Dangerous or blocked commands will be rejected. Use this for running build commands, tests, scripts, and other shell operations.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Maximum time in milliseconds before the command is killed. Defaults to 30000 (30 seconds).',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for the command. Defaults to the current working directory.',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const command = args.command as string;
    if (!command || typeof command !== 'string') {
      return { toolCallId: '', content: 'Error: command is required', isError: true };
    }

    const safety = classifyCommand(command);

    if (safety.level === 'blocked') {
      return {
        toolCallId: '',
        content: `Command blocked: ${safety.reason}\n\nThis command cannot be executed as it could cause catastrophic damage.`,
        isError: true,
      };
    }

    if (safety.level === 'dangerous') {
      if (!context.permissions.approve(command, 'execute')) {
        return {
          toolCallId: '',
          content: `Command requires permission: ${safety.reason}\n\n${safety.suggestion ?? ''}`,
          isError: true,
        };
      }
    }

    if (safety.level === 'moderate') {
      if (!context.permissions.approve(command, 'execute')) {
        return {
          toolCallId: '',
          content: `Command requires permission: ${safety.reason}\n\n${safety.suggestion ?? ''}`,
          isError: true,
        };
      }
    }

    const cwd = (args.cwd as string) || context.cwd;
    const timeout = (args.timeout as number) ?? 30_000;

    context.onProgress?.(`Executing: ${command}`);

    const result = await executeCommand(command, {
      cwd,
      timeout,
    });

    const content = formatResult(command, result, safety.level);

    return {
      toolCallId: '',
      content,
      isError: result.exitCode !== 0,
    };
  },
};

export const shellTools: ToolHandler[] = [runCommandTool];
