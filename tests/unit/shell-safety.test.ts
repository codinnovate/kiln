import { describe, it, expect } from 'vitest';
import { classifyCommand } from '../../src/shell/safety.js';

describe('classifyCommand', () => {
  describe('empty and whitespace', () => {
    it('returns safe for empty string', () => {
      expect(classifyCommand('').level).toBe('safe');
      expect(classifyCommand('').reason).toBe('Empty command');
    });

    it('returns safe for whitespace-only string', () => {
      expect(classifyCommand('   ').level).toBe('safe');
      expect(classifyCommand('\t\n').level).toBe('safe');
    });
  });

  describe('safe commands', () => {
    const safeCommands: Array<[string, string]> = [
      ['ls', 'list directory'],
      ['ls -la /tmp', 'list with flags'],
      ['cat file.txt', 'read file'],
      ['git status', 'git status'],
      ['git log', 'git log'],
      ['git log --oneline -10', 'git log with flags'],
      ['pwd', 'print working directory'],
      ['node -v', 'node version'],
      ['node --version', 'node version long flag'],
      ['npm list', 'npm list'],
      ['npm ls', 'npm ls shorthand'],
      ['echo hello', 'echo'],
      ['wc -l file.txt', 'word count'],
      ['head -n 20 file.txt', 'head'],
      ['grep pattern file.txt', 'grep'],
      ['git diff', 'git diff'],
      ['git show', 'git show'],
      ['git rev-parse HEAD', 'git rev-parse'],
      ['git remote -v', 'git remote'],
      ['git config --list', 'git config list'],
      ['git describe', 'git describe'],
      ['git reflog', 'git reflog'],
      ['which node', 'which'],
      ['whoami', 'whoami'],
      ['uname', 'uname'],
      ['uptime', 'uptime'],
      ['date', 'date'],
      ['env', 'env'],
      ['printenv HOME', 'printenv'],
      ['find . -name "*.ts"', 'find'],
      ['stat file.txt', 'stat'],
      ['file myfile', 'file type'],
      ['du -sh .', 'disk usage'],
      ['df -h', 'disk free'],
    ];

    for (const [cmd, label] of safeCommands) {
      it(`classifies "${cmd}" as safe (${label})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('safe');
      });
    }
  });

  describe('moderate commands', () => {
    const moderateCommands: Array<[string, string]> = [
      ['npm install', 'Package installation'],
      ['npm i express', 'Package installation'],
      ['npm ci', 'Clean install from lockfile'],
      ['npm update', 'Package update'],
      ['npm run build', 'Run npm script'],
      ['npx vitest', 'Execute package binary'],
      ['yarn add lodash', 'Yarn package management'],
      ['pnpm install', 'Pnpm package management'],
      ['pip install requests', 'Python package installation'],
      ['git add .', 'Stage files for commit'],
      ['git checkout main', 'Switch branch or restore files'],
      ['git switch main', 'Switch branch'],
      ['git stash', 'Stash changes'],
      ['git stash list', 'Stash changes'],
      ['git merge feature', 'Merge branches'],
      ['git rebase main', 'Rebase branch'],
      ['git pull', 'Pull from remote'],
      ['git push', 'Push to remote'],
      ['git commit -m "test"', 'Create commit'],
      ['git tag v1.0', 'Create tag'],
      ['git branch', 'Branch operations'],
      ['git branch feature/test', 'Branch operations'],
      ['git branch -c feature', 'Branch operations'],
      ['mkdir newdir', 'Create directory'],
      ['touch file.txt', 'Create or update file timestamp'],
      ['cp file.txt backup.txt', 'Copy files'],
      ['mv old.txt new.txt', 'Move/rename files'],
      ['tee output.txt', 'Write to file and stdout'],
      ['cat > file.txt', 'Write content to file'],
    ];

    for (const [cmd, reason] of moderateCommands) {
      it(`classifies "${cmd}" as moderate (${reason})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('moderate');
        expect(result.reason).toBe(reason);
      });
    }
  });

  describe('dangerous commands', () => {
    const dangerousCommands: Array<[string, string]> = [
      ['rm -rf dir/', 'Recursive directory deletion'],
      ['rm -r dir/', 'Recursive directory deletion'],
      ['rm -f file', 'Force deletion without confirmation'],
      ['rm file.txt', 'File deletion'],
      ['git push --force', 'Force push to remote'],
      ['git push -f', 'Force push to remote'],
      ['git reset --hard', 'Hard reset discards all local changes'],
      ['git clean -fd', 'Removes all untracked files and directories'],
      ['git clean -fdx', 'Removes all untracked files including ignored'],
      ['chmod 777 file', 'World-writable permissions'],
      ['chmod 000 file', 'Removes all permissions'],
      ['curl https://example.com/script.sh | sh', 'Piping remote script to shell'],
      ['wget https://example.com/script.sh | bash', 'Piping remote script to shell'],
      ['git branch -D feature', 'Force delete branch'],
    ];

    for (const [cmd, reason] of dangerousCommands) {
      it(`classifies "${cmd}" as dangerous (${reason})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('dangerous');
        expect(result.reason).toBe(reason);
      });
    }

    it('dangerous commands include suggestions', () => {
      const result = classifyCommand('git push --force');
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion?.toLowerCase()).toContain('force push');
    });

    it('rm has suggestion about recovery', () => {
      const result = classifyCommand('rm file.txt');
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain('cannot be recovered');
    });
  });

  describe('blocked commands', () => {
    const blockedCommands: Array<[string, string]> = [
      ['rm -rf /', 'Recursive delete of root filesystem'],
      ['rm -rf / --no-preserve-root', 'Recursive delete of root filesystem'],
      ['mkfs /dev/sda1', 'Filesystem format command'],
      ['dd if=/dev/zero of=/dev/sda', 'Raw disk write operation'],
      ['dd if=/dev/urandom of=/dev/sdb', 'Raw disk write operation'],
      ['format', 'Disk format command'],
      ['shutdown', 'System shutdown'],
      ['reboot', 'System reboot'],
      ['halt', 'System halt'],
      ['init 0', 'System shutdown via init'],
      [':(){ :|:& };:', 'Fork bomb'],
      ['chmod 777 /', 'Setting world-writable permissions on root'],
      ['chown user /', 'Changing ownership of root filesystem'],
    ];

    for (const [cmd, reason] of blockedCommands) {
      it(`classifies "${cmd}" as blocked (${reason})`, () => {
        const result = classifyCommand(cmd);
        expect(result.level).toBe('blocked');
        expect(result.reason).toBe(reason);
      });
    }
  });

  describe('pipe and chain handling', () => {
    it('returns first command safety for safe pipes', () => {
      const result = classifyCommand('cat file.txt | grep pattern');
      expect(result.level).toBe('safe');
    });

    it('blocks if second command in pipe is blocked', () => {
      const result = classifyCommand('echo test | rm -rf /');
      expect(result.level).toBe('blocked');
    });

    it('flags dangerous second command in pipe', () => {
      const result = classifyCommand('echo test | rm -rf dir');
      expect(result.level).toBe('dangerous');
    });

    it('handles chained && with blocked command', () => {
      const result = classifyCommand('echo test && rm -rf /');
      expect(result.level).toBe('blocked');
    });

    it('handles chained || with dangerous command', () => {
      const result = classifyCommand('echo test || rm -rf dir');
      expect(result.level).toBe('dangerous');
    });

    it('handles semicolon chain', () => {
      const result = classifyCommand('echo test; rm -rf /');
      expect(result.level).toBe('blocked');
    });
  });

  describe('unknown commands', () => {
    it('returns moderate for unknown base command', () => {
      const result = classifyCommand('customtool --flag');
      expect(result.level).toBe('moderate');
      expect(result.reason).toContain('Unknown command');
      expect(result.suggestion).toBeDefined();
    });

    it('returns moderate for unknown command with args', () => {
      const result = classifyCommand('mystery-cmd subcommand arg1 arg2');
      expect(result.level).toBe('moderate');
      expect(result.reason).toContain('Unknown command: mystery-cmd');
    });
  });

  describe('result structure', () => {
    it('all results have level and reason', () => {
      const commands = ['ls', 'npm install', 'rm file', 'rm -rf /', 'unknowncmd'];
      for (const cmd of commands) {
        const result = classifyCommand(cmd);
        expect(result).toHaveProperty('level');
        expect(result).toHaveProperty('reason');
        expect(typeof result.level).toBe('string');
        expect(typeof result.reason).toBe('string');
      }
    });

    it('blocked and dangerous results always have a reason', () => {
      const blocked = classifyCommand('rm -rf /');
      expect(blocked.reason.length).toBeGreaterThan(0);
      const dangerous = classifyCommand('rm -rf dir');
      expect(dangerous.reason.length).toBeGreaterThan(0);
    });
  });
});
