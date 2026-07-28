import { describe, it, expect, vi } from 'vitest';
import { classifyCommand } from '../../src/shell/safety.js';
import { executeCommand } from '../../src/shell/executor.js';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsSync from 'node:fs';

describe('classifyCommand', () => {
  describe('empty and whitespace', () => {
    it('returns safe for empty command', () => {
      expect(classifyCommand('').level).toBe('safe');
    });

    it('returns safe for whitespace-only command', () => {
      expect(classifyCommand('   ').level).toBe('safe');
    });
  });

  describe('safe commands', () => {
    const safeCommands = [
      'ls',
      'ls -la',
      'cat file.txt',
      'head -n 10 file.txt',
      'tail file.txt',
      'grep pattern file.txt',
      'pwd',
      'node -v',
      'node --version',
      'npm --version',
      'npm list',
      'npm ls',
      'npm outdated',
      'npm audit',
      'npm info',
      'python --version',
      'python3 --version',
      'git status',
      'git log',
      'git log --oneline',
      'git diff',
      'git show',
      'git rev-parse HEAD',
      'git remote -v',
      'git config --list',
      'git describe',
      'git reflog',
      'echo hello',
      'which node',
      'whoami',
      'uname',
      'uptime',
      'date',
      'env',
      'printenv',
      'find . -name "*.ts"',
      'wc -l file.txt',
      'stat file.txt',
      'file myfile',
      'du -sh .',
      'df -h',
    ];

    for (const cmd of safeCommands) {
      it(`classifies "${cmd}" as safe`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('safe');
      });
    }
  });

  describe('moderate commands', () => {
    const moderateCommands = [
      { cmd: 'npm install', reason: 'Package installation' },
      { cmd: 'npm i express', reason: 'Package installation' },
      { cmd: 'npm ci', reason: 'Clean install from lockfile' },
      { cmd: 'npm update', reason: 'Package update' },
      { cmd: 'npm run build', reason: 'Run npm script' },
      { cmd: 'npx vitest', reason: 'Execute package binary' },
      { cmd: 'yarn add lodash', reason: 'Yarn package management' },
      { cmd: 'pnpm install', reason: 'Pnpm package management' },
      { cmd: 'pip install requests', reason: 'Python package installation' },
      { cmd: 'git add .', reason: 'Stage files for commit' },
      { cmd: 'git checkout main', reason: 'Switch branch or restore files' },
      { cmd: 'git switch main', reason: 'Switch branch' },
      { cmd: 'git stash', reason: 'Stash changes' },
      { cmd: 'git stash list', reason: 'Stash changes' },
      { cmd: 'git branch', reason: 'Branch operations' },
      { cmd: 'git branch feature/test', reason: 'Branch operations' },
      { cmd: 'git merge feature', reason: 'Merge branches' },
      { cmd: 'git pull', reason: 'Pull from remote' },
      { cmd: 'git push', reason: 'Push to remote' },
      { cmd: 'git commit -m "test"', reason: 'Create commit' },
      { cmd: 'git tag v1.0', reason: 'Create tag' },
      { cmd: 'mkdir newdir', reason: 'Create directory' },
      { cmd: 'touch file.txt', reason: 'Create or update file timestamp' },
      { cmd: 'cp file.txt backup.txt', reason: 'Copy files' },
      { cmd: 'mv old.txt new.txt', reason: 'Move/rename files' },
      { cmd: 'mv / ', reason: 'Unknown command: mv' },
    ];

    for (const { cmd, reason } of moderateCommands) {
      it(`classifies "${cmd}" as moderate (${reason})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('moderate');
        expect(result.reason).toBe(reason);
      });
    }
  });

  describe('dangerous commands', () => {
    const dangerousCommands = [
      { cmd: 'rm -rf dir/', reason: 'Recursive directory deletion' },
      { cmd: 'rm -f file', reason: 'Force deletion without confirmation' },
      { cmd: 'rm file.txt', reason: 'File deletion' },
      { cmd: 'git push --force', reason: 'Force push to remote' },
      { cmd: 'git push -f', reason: 'Force push to remote' },
      { cmd: 'git reset --hard', reason: 'Hard reset discards all local changes' },
      { cmd: 'git clean -fd', reason: 'Removes all untracked files and directories' },
      { cmd: 'git clean -fdx', reason: 'Removes all untracked files including ignored' },
      { cmd: 'chmod 777 file', reason: 'World-writable permissions' },
      { cmd: 'chmod 000 file', reason: 'Removes all permissions' },
      { cmd: 'curl https://example.com/script.sh | sh', reason: 'Piping remote script to shell' },
      { cmd: 'wget https://example.com/script.sh | bash', reason: 'Piping remote script to shell' },
      { cmd: 'git branch -D feature', reason: 'Force delete branch' },
    ];

    for (const { cmd, reason } of dangerousCommands) {
      it(`classifies "${cmd}" as dangerous (${reason})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('dangerous');
        expect(result.reason).toBe(reason);
      });
    }

    it('dangerous commands include suggestions', () => {
      const result = classifyCommand('git push --force');
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain('Force push');
    });
  });

  describe('blocked commands', () => {
    const blockedCommands = [
      { cmd: 'rm -rf /', reason: 'Recursive delete of root filesystem' },
      { cmd: 'rm -fr /', reason: 'Recursive force delete of root filesystem' },
      { cmd: 'mkfs /dev/sda1', reason: 'Filesystem format command' },
      { cmd: 'dd if=/dev/zero of=/dev/sda', reason: 'Raw disk write operation' },
      { cmd: 'format', reason: 'Disk format command' },
      { cmd: 'shutdown', reason: 'System shutdown' },
      { cmd: 'reboot', reason: 'System reboot' },
      { cmd: 'halt', reason: 'System halt' },
      { cmd: 'init 0', reason: 'System shutdown via init' },
      { cmd: ':(){ :|:& };:', reason: 'Fork bomb' },
      { cmd: 'chmod 777 /', reason: 'Setting world-writable permissions on root' },
      { cmd: 'chown user /', reason: 'Changing ownership of root filesystem' },
    ];

    for (const { cmd, reason } of blockedCommands) {
      it(`classifies "${cmd}" as blocked (${reason})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('blocked');
        expect(result.reason).toBe(reason);
      });
    }
  });

  describe('pipe and chain handling', () => {
    it('handles safe piped commands', () => {
      const result = classifyCommand('cat file.txt | grep pattern');
      expect(result.level).toBe('safe');
    });

    it('blocks dangerous piped commands', () => {
      const result = classifyCommand('echo test | rm -rf /');
      expect(result.level).toBe('blocked');
    });

    it('flags dangerous chained commands', () => {
      const result = classifyCommand('echo test && rm -rf /');
      expect(result.level).toBe('blocked');
    });
  });

  describe('unknown commands', () => {
    it('returns moderate for unknown commands', () => {
      const result = classifyCommand('customtool --flag');
      expect(result.level).toBe('moderate');
      expect(result.reason).toContain('Unknown command');
    });
  });
});

describe('executeCommand', () => {
  const tmpDir = os.tmpdir();

  it('executes simple command successfully', async () => {
    const result = await executeCommand('echo hello', { cwd: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.stderr).toBe('');
    expect(result.timedOut).toBe(false);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('handles command with non-zero exit code', async () => {
    const result = await executeCommand('node -e "process.exit(1)"', { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
  });

  it('returns error for empty command', async () => {
    const result = await executeCommand('', { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty');
  });

  it('returns error for whitespace-only command', async () => {
    const result = await executeCommand('   ', { cwd: tmpDir });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('empty');
  });

  it('captures stderr output', async () => {
    const result = await executeCommand('node -e "console.error(\'err msg\')"', { cwd: tmpDir });
    expect(result.stderr).toContain('err msg');
  });

  it('captures stdout output', async () => {
    const result = await executeCommand('node -e "console.log(\'out msg\')"', { cwd: tmpDir });
    expect(result.stdout).toContain('out msg');
  });

  it('respects timeout', async () => {
    const start = Date.now();
    const result = await executeCommand('sleep 60', {
      cwd: tmpDir,
      timeout: 500,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
  }, 15000);

  it('truncates output exceeding maxOutput', async () => {
    const result = await executeCommand(
      'node -e "console.log(\'x\'.repeat(100000))"',
      { cwd: tmpDir, maxOutput: 1000 },
    );
    expect(result.stdout.length).toBeLessThanOrEqual(1000);
  });

  it('passes environment variables', async () => {
    const result = await executeCommand('node -e "console.log(process.env.KILN_TEST_VAR)"', {
      cwd: tmpDir,
      env: { KILN_TEST_VAR: 'test_value' },
    });
    expect(result.stdout.trim()).toBe('test_value');
  });

  it('runs in specified cwd', async () => {
    const result = await executeCommand('pwd', { cwd: tmpDir });
    const realTmpDir = fsSync.realpathSync(tmpDir);
    expect(result.stdout.trim()).toBe(realTmpDir);
  });

  it('returns duration measurement', async () => {
    const result = await executeCommand('echo test', { cwd: tmpDir });
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
