import { describe, it, expect } from 'vitest';
import { executeCommand, type ExecResult } from '../../src/shell/executor.js';
import * as os from 'node:os';

const tmpDir = os.tmpdir();

describe('executeCommand edge cases', () => {
  it('returns error for empty string', async () => {
    const result = await executeCommand('', { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty or invalid command');
    expect(result.stdout).toBe('');
    expect(result.timedOut).toBe(false);
  });

  it('returns error for whitespace-only string', async () => {
    const result = await executeCommand('   ', { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty or invalid command');
  });

  it('returns error for tab-only string', async () => {
    const result = await executeCommand('\t', { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty or invalid command');
  });

  it('captures multi-line stdout', async () => {
    const result = await executeCommand('node -e "console.log(\'line1\'); console.log(\'line2\')"', { cwd: tmpDir });
    expect(result.stdout).toContain('line1');
    expect(result.stdout).toContain('line2');
    expect(result.exitCode).toBe(0);
  });

  it('captures multi-line stderr', async () => {
    const result = await executeCommand(
      'node -e "console.error(\'err1\'); console.error(\'err2\')"',
      { cwd: tmpDir },
    );
    expect(result.stderr).toContain('err1');
    expect(result.stderr).toContain('err2');
  });

  it('handles command with non-zero exit code', async () => {
    const result = await executeCommand('node -e "process.exit(42)"', { cwd: tmpDir });
    expect(result.exitCode).toBe(42);
  });

  it('handles command that produces no output', async () => {
    const result = await executeCommand('node -e ""', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('handles command with special characters in output', async () => {
    const result = await executeCommand('node -e "console.log(\'hello\\nworld\\ttab\')"', { cwd: tmpDir });
    expect(result.stdout).toContain('hello');
    expect(result.stdout).toContain('world');
  });

  it('duration is non-negative', async () => {
    const result = await executeCommand('echo test', { cwd: tmpDir });
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.duration).toBe('number');
  });

  it('timedOut is false for fast commands', async () => {
    const result = await executeCommand('echo fast', { cwd: tmpDir });
    expect(result.timedOut).toBe(false);
  });

  it('handles very long-running command with timeout', async () => {
    const result = await executeCommand('node -e "setTimeout(() => {}, 30000)"', {
      cwd: tmpDir,
      timeout: 500,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  }, 8000);

  it('respects maxOutput limit', async () => {
    const result = await executeCommand(
      'node -e "console.log(\'x\'.repeat(200000))"',
      { cwd: tmpDir, maxOutput: 500 },
    );
    expect(result.stdout.length).toBeLessThanOrEqual(500);
  });

  it('passes custom env variables', async () => {
    const result = await executeCommand(
      'node -e "console.log(process.env.KILN_EXEC_TEST_VAR)"',
      { cwd: tmpDir, env: { KILN_EXEC_TEST_VAR: 'hello_exec' } },
    );
    expect(result.stdout.trim()).toBe('hello_exec');
  });

  it('inherits process env by default', async () => {
    const result = await executeCommand(
      'node -e "console.log(process.env.HOME || \'none\')"',
      { cwd: tmpDir },
    );
    expect(result.stdout.trim()).not.toBe('none');
  });

  it('runs in the specified cwd', async () => {
    const result = await executeCommand('pwd', { cwd: tmpDir });
    const realTmpDir = require('node:fs').realpathSync(tmpDir);
    expect(result.stdout.trim()).toBe(realTmpDir);
  });

  it('handles command that writes to both stdout and stderr', async () => {
    const result = await executeCommand(
      'node -e "console.log(\'out\'); console.error(\'err\')"',
      { cwd: tmpDir },
    );
    expect(result.stdout).toContain('out');
    expect(result.stderr).toContain('err');
  });

  it('exit code is 0 for successful commands', async () => {
    const result = await executeCommand('true', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
  });

  it('handles chained commands', async () => {
    const result = await executeCommand('echo first && echo second', { cwd: tmpDir });
    expect(result.stdout).toContain('first');
    expect(result.stdout).toContain('second');
    expect(result.exitCode).toBe(0);
  });

  it('handles semicolon-separated commands', async () => {
    const result = await executeCommand('echo a; echo b', { cwd: tmpDir });
    expect(result.stdout).toContain('a');
    expect(result.stdout).toContain('b');
  });
});
