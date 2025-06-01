import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/prompts.js';
import type { AgentConfig, RepoInfo } from '../../src/agent/types.js';

const baseConfig: AgentConfig = {
  model: 'anthropic/claude-sonnet-4-20250514',
  provider: 'anthropic',
  cwd: '/home/user/project',
  maxIterations: 20,
};

describe('buildSystemPrompt', () => {
  describe('default prompt', () => {
    it('includes the Kiln identity', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('You are Kiln');
      expect(prompt).toContain('AI coding assistant');
    });

    it('includes core principles', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('Inspect before changing');
      expect(prompt).toContain('Make focused changes');
      expect(prompt).toContain('Handle errors gracefully');
      expect(prompt).toContain('Respect the codebase');
    });

    it('includes tool usage guidelines', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('Tool Usage');
      expect(prompt).toContain('read it first');
      expect(prompt).toContain('safe, read-only commands');
    });

    it('includes safety instructions', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('Safety');
      expect(prompt).toContain('destructive commands');
      expect(prompt).toContain('explicit user confirmation');
      expect(prompt).toContain('secrets');
    });

    it('includes communication guidelines', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('Communication');
      expect(prompt).toContain('concise');
    });
  });

  describe('config injection', () => {
    it('includes the model name', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('anthropic/claude-sonnet-4-20250514');
    });

    it('includes the cwd', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('/home/user/project');
    });

    it('uses a different cwd', () => {
      const config = { ...baseConfig, cwd: '/var/www/app' };
      const prompt = buildSystemPrompt(config);
      expect(prompt).toContain('/var/www/app');
    });

    it('includes the model line', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('Model:');
    });

    it('includes the working directory line', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).toContain('Current working directory:');
    });
  });

  describe('custom system prompt', () => {
    it('replaces the default prompt with custom text', () => {
      const config: AgentConfig = {
        ...baseConfig,
        systemPrompt: 'You are a test bot that writes tests.',
      };
      const prompt = buildSystemPrompt(config);
      expect(prompt).toContain('You are a test bot that writes tests.');
      expect(prompt).not.toContain('You are Kiln');
      expect(prompt).not.toContain('coding assistant');
    });

    it('still includes cwd and model with custom prompt', () => {
      const config: AgentConfig = {
        ...baseConfig,
        systemPrompt: 'Custom instructions here.',
      };
      const prompt = buildSystemPrompt(config);
      expect(prompt).toContain('/home/user/project');
      expect(prompt).toContain('anthropic/claude-sonnet-4-20250514');
    });

    it('handles empty custom prompt', () => {
      const config: AgentConfig = { ...baseConfig, systemPrompt: '' };
      const prompt = buildSystemPrompt(config);
      expect(prompt).toContain('Current working directory:');
      expect(prompt).toContain('Model:');
    });
  });

  describe('repo info', () => {
    it('adds project context section when repoInfo provided', () => {
      const repoInfo: RepoInfo = {
        root: '/test/project',
        languages: { TypeScript: 10 },
        totalFiles: 10,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).toContain('Project Context');
      expect(prompt).toContain('/test/project');
    });

    it('does not include project context when no repoInfo', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(prompt).not.toContain('Project Context');
    });

    it('includes total files count', () => {
      const repoInfo: RepoInfo = {
        root: '/proj',
        languages: {},
        totalFiles: 42,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).toContain('42');
    });

    it('includes project root path', () => {
      const repoInfo: RepoInfo = {
        root: '/my/special/project',
        languages: {},
        totalFiles: 0,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).toContain('/my/special/project');
    });

    it('includes sorted languages', () => {
      const repoInfo: RepoInfo = {
        root: '/proj',
        languages: { Python: 5, TypeScript: 20, CSS: 3 },
        totalFiles: 28,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).toContain('TypeScript (20 files)');
      expect(prompt).toContain('Python (5 files)');
      expect(prompt).toContain('CSS (3 files)');
    });

    it('limits languages to top 10', () => {
      const repoInfo: RepoInfo = {
        root: '/proj',
        languages: {
          TypeScript: 50, Python: 40, Go: 30, Rust: 20, Java: 15,
          C: 12, Cpp: 10, Ruby: 8, PHP: 5, Scala: 3, Kotlin: 2, Swift: 1,
        },
        totalFiles: 196,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).toContain('Scala (3 files)');
      expect(prompt).not.toContain('Kotlin');
      expect(prompt).not.toContain('Swift');
    });

    it('handles empty languages', () => {
      const repoInfo: RepoInfo = {
        root: '/proj',
        languages: {},
        totalFiles: 5,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).toContain('Project Context');
      expect(prompt).toContain('5');
      expect(prompt).not.toContain('Languages:');
    });

    it('omits languages line when no languages detected', () => {
      const repoInfo: RepoInfo = {
        root: '/proj',
        languages: {},
        totalFiles: 0,
      };
      const prompt = buildSystemPrompt(baseConfig, repoInfo);
      expect(prompt).not.toContain('Languages:');
    });
  });

  describe('combined scenarios', () => {
    it('includes both custom prompt and repo info', () => {
      const config: AgentConfig = {
        ...baseConfig,
        systemPrompt: 'Be helpful.',
      };
      const repoInfo: RepoInfo = {
        root: '/proj',
        languages: { TypeScript: 1 },
        totalFiles: 1,
      };
      const prompt = buildSystemPrompt(config, repoInfo);
      expect(prompt).toContain('Be helpful.');
      expect(prompt).toContain('Project Context');
      expect(prompt).not.toContain('You are Kiln');
    });

    it('output is a single string', () => {
      const prompt = buildSystemPrompt(baseConfig);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('sections are separated by newlines', () => {
      const prompt = buildSystemPrompt(baseConfig);
      const lines = prompt.split('\n');
      expect(lines.length).toBeGreaterThan(10);
    });
  });
});
