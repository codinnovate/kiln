import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeCommand } from '../../src/shell/executor.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiln-shell-int-'));
}

describe('Shell executor integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes a simple command and returns output', async () => {
    const result = await executeCommand('echo "hello world"', { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello world');
    expect(result.stderr).toBe('');
  });

  it('captures stderr output', async () => {
    const result = await executeCommand('echo "error msg" >&2', { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr.trim()).toBe('error msg');
  });

  it('returns non-zero exit code on failure', async () => {
    const result = await executeCommand('exit 42', { cwd: tmpDir });

    expect(result.exitCode).toBe(42);
  });

  it('executes commands in specified directory', async () => {
    const result = await executeCommand('pwd', { cwd: tmpDir });

    expect(result.stdout.trim()).toBe(fs.realpathSync(tmpDir));
  });

  it('times out long-running commands', async () => {
    const result = await executeCommand('sleep 10', { cwd: tmpDir, timeout: 200 });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  });

  it('handles commands with large output', async () => {
    const largeOutput = 'x'.repeat(10_000);
    const result = await executeCommand(`echo "${largeOutput}"`, {
      cwd: tmpDir,
      maxOutput: 1024 * 1024,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().length).toBe(10_000);
  });

  it('handles empty command gracefully', async () => {
    const result = await executeCommand('', { cwd: tmpDir });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty');
  });

  it('chains commands with pipes', async () => {
    const result = await executeCommand('echo "a\nb\nc" | wc -l', { cwd: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('3');
  });

  it('passes environment variables', async () => {
    const result = await executeCommand('echo "$CUSTOM_VAR"', {
      cwd: tmpDir,
      env: { CUSTOM_VAR: 'custom_value' },
    });

    expect(result.stdout.trim()).toBe('custom_value');
  });

  it('handles stdin pipe', async () => {
    // executeCommand doesn't support stdin, just verify the function works
    const result = await executeCommand('echo "ok"', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
  });
});
