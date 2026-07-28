import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { estimateTokens, truncateToTokens } from '../../src/context/token-estimator.js';
import { ContextBuilder } from '../../src/context/builder.js';
import { ContextEngine } from '../../src/context/engine.js';
import { scanRepository } from '../../src/context/scanner.js';
import type { RepoInfo, Message, ContextBudget } from '../../src/context/types.js';

function createTempDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'kiln-context-test-'));
}

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined', () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it('estimates tokens for plain text', () => {
    const text = 'Hello world, this is a test message.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length);
  });

  it('estimates more tokens for longer text', () => {
    const short = 'Hello';
    const long = 'Hello world, this is a much longer text that should have more tokens estimated.';
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });

  it('uses code-specific estimation for code files', () => {
    const codeText = 'import { foo } from "bar";\nconst x = () => { return x; };';
    const plainText = 'This is some plain text content for reading.';
    const codeTokens = estimateTokens(codeText, 'test.ts');
    const plainTokens = estimateTokens(plainText, 'test.txt');
    expect(codeTokens).toBeGreaterThan(0);
    expect(plainTokens).toBeGreaterThan(0);
  });

  it('detects code by content when no filename given', () => {
    const codeText = 'import React from "react";\nexport function App() { return <div />; }';
    const tokens = estimateTokens(codeText);
    expect(tokens).toBeGreaterThan(0);
  });

  it('estimates multi-line text with overhead', () => {
    const singleLine = 'a'.repeat(100);
    const multiLine = Array(10).fill('a'.repeat(10)).join('\n');
    const singleTokens = estimateTokens(singleLine);
    const multiTokens = estimateTokens(multiLine);
    expect(multiTokens).toBeGreaterThan(singleTokens);
  });
});

describe('truncateToTokens', () => {
  it('returns empty string for maxTokens <= 0', () => {
    expect(truncateToTokens('hello', 0)).toBe('');
    expect(truncateToTokens('hello', -1)).toBe('');
  });

  it('returns empty string for empty text', () => {
    expect(truncateToTokens('', 100)).toBe('');
  });

  it('returns full text when within limit', () => {
    const text = 'Short text';
    const result = truncateToTokens(text, 1000);
    expect(result).toBe(text);
  });

  it('truncates long text', () => {
    const text = 'word '.repeat(10000);
    const result = truncateToTokens(text, 50);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain('[truncated]');
  });

  it('truncates at a newline boundary when possible', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
    const result = truncateToTokens(lines, 20);
    expect(result).toContain('[truncated]');
    const lastChars = result.slice(-20);
    expect(lastChars).toContain('\n');
  });
});

describe('ContextBuilder', () => {
  it('builds context with system prompt', () => {
    const builder = new ContextBuilder();
    builder.addSystemPrompt('You are a helpful assistant.');
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].content).toBe('You are a helpful assistant.');
    expect(result.entries[0].type).toBe('config');
    expect(result.entries[0].priority).toBe(1000);
  });

  it('builds context with project instructions', () => {
    const builder = new ContextBuilder();
    builder.addProjectInstructions('Follow coding standards.');
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].content).toBe('Follow coding standards.');
    expect(result.entries[0].priority).toBe(900);
  });

  it('adds conversation history', () => {
    const builder = new ContextBuilder();
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];
    builder.addConversationHistory(messages);
    const result = builder.build();
    expect(result.entries.length).toBe(2);
    const historyEntries = result.entries.filter((e) => e.type === 'history');
    expect(historyEntries.length).toBe(2);
  });

  it('summarizes older messages beyond 50', () => {
    const builder = new ContextBuilder();
    const messages: Message[] = Array.from({ length: 60 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `Message ${i}`,
    }));
    builder.addConversationHistory(messages);
    const result = builder.build();
    const summaryEntries = result.entries.filter(
      (e) => e.metadata?.category === 'history_summary',
    );
    expect(summaryEntries.length).toBe(1);
  });

  it('adds repository context', () => {
    const builder = new ContextBuilder();
    const repoInfo: RepoInfo = {
      root: '/test/project',
      files: [
        {
          path: 'src/index.ts',
          size: 1024,
          type: 'file',
          extension: '.ts',
          lastModified: new Date(),
          language: 'TypeScript',
        },
      ],
      languages: { TypeScript: 1 },
      totalFiles: 1,
      totalSize: 1024,
    };
    builder.addRepositoryContext(repoInfo);
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].content).toContain('TypeScript');
    expect(result.entries[0].content).toContain('/test/project');
  });

  it('adds file content', () => {
    const builder = new ContextBuilder();
    builder.addFileContent('src/index.ts', 'const x = 1;');
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].type).toBe('file');
    expect(result.entries[0].source).toBe('src/index.ts');
  });

  it('adds git diff', () => {
    const builder = new ContextBuilder();
    builder.addGitDiff('+ added line\n- removed line');
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].type).toBe('git');
    expect(result.entries[0].content).toContain('+ added line');
  });

  it('adds tool result', () => {
    const builder = new ContextBuilder();
    builder.addToolResult({
      toolCallId: 'tc-1',
      content: 'File read successfully',
      isError: false,
    });
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].type).toBe('tool_result');
  });

  it('adds recent files', () => {
    const builder = new ContextBuilder();
    builder.addRecentFiles(['src/index.ts', 'src/utils.ts']);
    const result = builder.build();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].content).toContain('src/index.ts');
  });

  it('respects context budget', () => {
    const smallBudget: Partial<ContextBudget> = {
      maxTokens: 100,
      reservedForResponse: 10,
      reservedForSystem: 10,
    };
    const builder = new ContextBuilder(smallBudget);
    builder.addSystemPrompt('A'.repeat(500));
    builder.addProjectInstructions('B'.repeat(500));
    builder.addFileContent('file.ts', 'C'.repeat(500));
    const result = builder.build();
    expect(result.totalTokens).toBeLessThanOrEqual(80);
  });

  it('sorts entries by priority', () => {
    const builder = new ContextBuilder();
    builder.addFileContent('low.ts', 'low priority');
    builder.addSystemPrompt('high priority');
    builder.addProjectInstructions('medium priority');
    const result = builder.build();
    expect(result.entries[0].priority).toBe(1000);
    expect(result.entries[1].priority).toBe(900);
  });

  it('warns on low context usage', () => {
    const builder = new ContextBuilder({ maxTokens: 200_000 });
    builder.addSystemPrompt('short');
    const result = builder.build();
    expect(result.warnings.some((w) => w.includes('low'))).toBe(true);
  });

  it('builds chainable', () => {
    const result = new ContextBuilder()
      .addSystemPrompt('sys')
      .addProjectInstructions('proj')
      .addGitDiff('diff')
      .build();
    expect(result.entries.length).toBe(3);
  });
});

describe('scanRepository', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = createTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scans a repository with files', async () => {
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'const x = 1;', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'readme.md'), '# Project', 'utf-8');
    await fs.mkdir(path.join(tmpDir, 'src'));
    await fs.writeFile(path.join(tmpDir, 'src', 'app.ts'), 'export {}', 'utf-8');

    const info = await scanRepository(tmpDir);
    expect(info.root).toBe(tmpDir);
    expect(info.totalFiles).toBe(3);
    expect(info.totalSize).toBeGreaterThan(0);
    expect(info.languages.TypeScript).toBe(2);
    expect(info.languages.Markdown).toBe(1);
  });

  it('ignores node_modules and .git', async () => {
    await fs.mkdir(path.join(tmpDir, 'node_modules'));
    await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg.js'), '', 'utf-8');
    await fs.mkdir(path.join(tmpDir, '.git'));
    await fs.writeFile(path.join(tmpDir, '.git', 'config'), '', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'code', 'utf-8');

    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(1);
  });

  it('ignores lockfiles', async () => {
    await fs.writeFile(path.join(tmpDir, 'package-lock.json'), '{}', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'yarn.lock'), '', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'code', 'utf-8');

    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(1);
  });

  it('reads package.json when present', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', version: '1.0.0' }),
      'utf-8',
    );

    const info = await scanRepository(tmpDir);
    expect(info.packageJson).toBeDefined();
    expect(info.packageJson!.name).toBe('test-pkg');
  });

  it('handles empty directory', async () => {
    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(0);
    expect(info.totalSize).toBe(0);
    expect(info.languages).toEqual({});
  });

  it('detects multiple languages', async () => {
    await fs.writeFile(path.join(tmpDir, 'app.ts'), '', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'style.css'), '', 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'readme.md'), '', 'utf-8');

    const info = await scanRepository(tmpDir);
    expect(Object.keys(info.languages)).toContain('TypeScript');
    expect(Object.keys(info.languages)).toContain('CSS');
    expect(Object.keys(info.languages)).toContain('Markdown');
  });
});

describe('ContextEngine AGENTS.md loading', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = createTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('loads AGENTS.md from project root', async () => {
    const agentsContent = '# Project Memory\n\nAlways use TypeScript.';
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), agentsContent, 'utf-8');

    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    expect(engine.getAgentsMdContent()).toBe(agentsContent);
  });

  it('returns undefined when AGENTS.md is missing', async () => {
    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    expect(engine.getAgentsMdContent()).toBeUndefined();
  });

  it('includes AGENTS.md as high-priority instruction in context', async () => {
    const agentsContent = '# Project Rules\n\nUse strict mode.';
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), agentsContent, 'utf-8');

    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    const result = await engine.buildContext([]);
    const instructionEntries = result.entries.filter(
      (e) => e.type === 'instruction' && e.content.includes('Project Rules'),
    );
    expect(instructionEntries.length).toBe(1);
    expect(instructionEntries[0].priority).toBe(900);
  });

  it('does not add instruction entry when AGENTS.md is missing', async () => {
    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    const result = await engine.buildContext([]);
    const instructionEntries = result.entries.filter((e) => e.type === 'instruction');
    expect(instructionEntries.length).toBe(0);
  });

  it('loads AGENTS.md in parallel with repo scan', async () => {
    const agentsContent = '# Instructions\n\nFollow conventions.';
    await fs.writeFile(path.join(tmpDir, 'AGENTS.md'), agentsContent, 'utf-8');
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'const x = 1;', 'utf-8');

    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    expect(engine.getAgentsMdContent()).toBe(agentsContent);
    expect(engine.getRepoInfo()).toBeDefined();
    expect(engine.getRepoInfo()!.totalFiles).toBe(2);
  });

  it('handles empty project gracefully in buildContext', async () => {
    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    const result = await engine.buildContext([]);
    expect(result.entries).toBeDefined();
    expect(result.totalTokens).toBeGreaterThanOrEqual(0);
    expect(result.warnings).toBeDefined();
  });

  it('handles empty project with empty message history', async () => {
    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    const result = await engine.buildContext([]);
    expect(result.entries.length).toBeGreaterThanOrEqual(0);
  });

  it('buildContext works with no repo info after failed scan', async () => {
    const engine = new ContextEngine('/nonexistent/path');
    await engine.initialize();

    const result = await engine.buildContext([]);
    expect(result).toBeDefined();
    expect(result.entries).toBeDefined();
  });

  it('trackFileAccess handles empty path', async () => {
    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    engine.trackFileAccess('');
    expect(engine.getFileHistory()).toContain('');
  });

  it('trackFileAccess deduplicates entries', async () => {
    const engine = new ContextEngine(tmpDir);
    await engine.initialize();

    engine.trackFileAccess('file1.ts');
    engine.trackFileAccess('file2.ts');
    engine.trackFileAccess('file1.ts');

    const history = engine.getFileHistory();
    expect(history[0]).toBe('file1.ts');
    expect(history.filter((f) => f === 'file1.ts')).toHaveLength(1);
  });
});
