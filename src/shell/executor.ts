import { spawn, type ChildProcess } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  duration: number;
}

export interface ExecOptions {
  cwd: string;
  timeout?: number;
  maxOutput?: number;
  env?: Record<string, string>;
}

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_OUTPUT = 50_000;

export async function executeCommand(
  command: string,
  options: ExecOptions,
): Promise<ExecResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const maxOutput = options.maxOutput ?? DEFAULT_MAX_OUTPUT;
  const startTime = Date.now();

  if (!command || typeof command !== 'string' || command.trim().length === 0) {
    return {
      stdout: '',
      stderr: 'Error: empty or invalid command',
      exitCode: 1,
      timedOut: false,
      duration: 0,
    };
  }

  const env = { ...process.env, ...options.env };

  return new Promise<ExecResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, [], {
        cwd: options.cwd,
        shell: true,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      resolve({
        stdout: '',
        stderr: `Failed to spawn process: ${msg}`,
        exitCode: 1,
        timedOut: false,
        duration: Date.now() - startTime,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killed = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // process may already be dead
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2000);
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length < maxOutput) {
        stdout += chunk;
      }
      if (stdout.length > maxOutput) {
        stdout = stdout.slice(0, maxOutput);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length < maxOutput) {
        stderr += chunk;
      }
      if (stderr.length > maxOutput) {
        stderr = stderr.slice(0, maxOutput);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      const msg = error.message || String(error);
      resolve({
        stdout,
        stderr: stderr || msg,
        exitCode: 1,
        timedOut,
        duration: Date.now() - startTime,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: killed ? -1 : (code ?? 1),
        timedOut,
        duration: Date.now() - startTime,
      });
    });
  });
}
