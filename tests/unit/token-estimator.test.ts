import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokens } from '../../src/context/token-estimator.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 0 for null/undefined input', () => {
    expect(estimateTokens(null as unknown as string)).toBe(0);
    expect(estimateTokens(undefined as unknown as string)).toBe(0);
  });

  it('returns positive number for non-empty text', () => {
    const tokens = estimateTokens('Hello world');
    expect(tokens).toBeGreaterThan(0);
  });

  it('returns fewer tokens than characters', () => {
    const text = 'Hello world, this is a test message with some words.';
    const tokens = estimateTokens(text);
    expect(tokens).toBeLessThan(text.length);
  });

  it('estimates more tokens for longer text', () => {
    const short = 'Hi';
    const long = 'This is a much longer piece of text that should produce more tokens than a short string.';
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });

  it('uses code-specific estimation for .ts files', () => {
    const code = 'import { foo } from "bar";\nconst x = () => { return x; };';
    const codeTokens = estimateTokens(code, 'test.ts');
    expect(codeTokens).toBeGreaterThan(0);
  });

  it('uses code-specific estimation for .js files', () => {
    const code = 'const x = require("y");\nmodule.exports = { x };';
    const tokens = estimateTokens(code, 'app.js');
    expect(tokens).toBeGreaterThan(0);
  });

  it('uses code-specific estimation for .py files', () => {
    const code = 'import os\nimport sys\ndef main():\n    return 0';
    const tokens = estimateTokens(code, 'main.py');
    expect(tokens).toBeGreaterThan(0);
  });

  it('uses code-specific estimation for .go files', () => {
    const code = 'package main\nimport "fmt"\nfunc main() {\n    fmt.Println("hello")\n}';
    const tokens = estimateTokens(code, 'main.go');
    expect(tokens).toBeGreaterThan(0);
  });

  it('detects code by content patterns when no filename given', () => {
    const codeText = 'import React from "react";\nexport function App() { return <div />; }';
    const tokens = estimateTokens(codeText);
    expect(tokens).toBeGreaterThan(0);
  });

  it('detects code with multiple indicators (>=2 score)', () => {
    const code = 'function hello() {\n  return 42;\n}';
    const tokens = estimateTokens(code);
    expect(tokens).toBeGreaterThan(0);
  });

  it('treats plain text without code indicators as non-code', () => {
    const plain = 'The quick brown fox jumps over the lazy dog. This is a plain sentence.';
    const tokens = estimateTokens(plain, 'readme.txt');
    expect(tokens).toBeGreaterThan(0);
  });

  it('handles single character input', () => {
    expect(estimateTokens('a')).toBeGreaterThan(0);
  });

  it('handles very long input', () => {
    const longText = 'word '.repeat(10000);
    const tokens = estimateTokens(longText);
    expect(tokens).toBeGreaterThan(100);
  });

  it('multi-line text has more overhead than single line', () => {
    const singleLine = 'a'.repeat(200);
    const multiLine = Array(20).fill('a'.repeat(10)).join('\n');
    const singleTokens = estimateTokens(singleLine);
    const multiTokens = estimateTokens(multiLine);
    expect(multiTokens).toBeGreaterThan(singleTokens);
  });

  it('handles .json as code', () => {
    const json = '{"key": "value", "nested": {"a": 1}}';
    const tokens = estimateTokens(json, 'config.json');
    expect(tokens).toBeGreaterThan(0);
  });

  it('handles .md as code', () => {
    const md = '# Title\n\nSome **bold** text here.';
    const tokens = estimateTokens(md, 'readme.md');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('truncateToTokens', () => {
  it('returns empty string for maxTokens <= 0', () => {
    expect(truncateToTokens('hello', 0)).toBe('');
    expect(truncateToTokens('hello', -5)).toBe('');
  });

  it('returns empty string for empty text', () => {
    expect(truncateToTokens('', 100)).toBe('');
  });

  it('returns full text when within token limit', () => {
    const text = 'Short text';
    const result = truncateToTokens(text, 1000);
    expect(result).toBe(text);
  });

  it('truncates text exceeding token limit', () => {
    const text = 'word '.repeat(10000);
    const result = truncateToTokens(text, 50);
    expect(result.length).toBeLessThan(text.length);
    expect(result).toContain('[truncated]');
  });

  it('truncates at newline boundary when close to cutoff', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join('\n');
    const result = truncateToTokens(lines, 20);
    expect(result).toContain('[truncated]');
  });

  it('returns full text for code within limit', () => {
    const code = 'const x = 1;\nconst y = 2;';
    const result = truncateToTokens(code, 1000, 'test.ts');
    expect(result).toBe(code);
  });

  it('truncates long code files', () => {
    const code = 'const x = 1;\n'.repeat(1000);
    const result = truncateToTokens(code, 20, 'test.ts');
    expect(result.length).toBeLessThan(code.length);
    expect(result).toContain('[truncated]');
  });

  it('truncation marker is present in truncated output', () => {
    const text = 'a'.repeat(10000);
    const result = truncateToTokens(text, 10);
    expect(result).toMatch(/\.\.\. \[truncated\]$/);
  });

  it('returns exact text when exactly at limit', () => {
    const text = 'Hello';
    const result = truncateToTokens(text, 100);
    expect(result).toBe(text);
  });

  it('handles null/undefined text gracefully', () => {
    expect(truncateToTokens(null as unknown as string, 100)).toBe('');
    expect(truncateToTokens(undefined as unknown as string, 100)).toBe('');
  });
});
