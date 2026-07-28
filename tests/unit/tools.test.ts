import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolRegistry } from '../../src/tools/registry.js';
import type { ToolHandler, ToolContext } from '../../src/tools/registry.js';
import {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirectoryTool,
  searchFilesTool,
  globFilesTool,
} from '../../src/tools/filesystem.js';

function createTempDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'kiln-tools-test-'));
}

function removeTempDir(dir: string): void {
  fsSync.rmSync(dir, { recursive: true, force: true });
}

function makeContext(cwd: string): ToolContext {
  return {
    cwd,
    permissions: {
      approve: () => true,
    },
  };
}

function makeDenyContext(cwd: string): ToolContext {
  return {
    cwd,
    permissions: {
      approve: () => false,
    },
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and retrieves tools', () => {
    const tool: ToolHandler = {
      name: 'test_tool',
      description: 'A test tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ toolCallId: '', content: 'ok', isError: false }),
    };
    registry.register(tool);
    expect(registry.get('test_tool')).toBe(tool);
  });

  it('returns undefined for unknown tools', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered tools', () => {
    const tool1: ToolHandler = {
      name: 'tool1', description: 'Tool 1', parameters: {},
      execute: async () => ({ toolCallId: '', content: '', isError: false }),
    };
    const tool2: ToolHandler = {
      name: 'tool2', description: 'Tool 2', parameters: {},
      execute: async () => ({ toolCallId: '', content: '', isError: false }),
    };
    registry.register(tool1);
    registry.register(tool2);
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(tool1);
    expect(list).toContain(tool2);
  });

  it('returns tool definitions', () => {
    const tool: ToolHandler = {
      name: 'my_tool',
      description: 'My tool desc',
      parameters: { type: 'object', properties: { arg: { type: 'string' } } },
      execute: async () => ({ toolCallId: '', content: '', isError: false }),
    };
    registry.register(tool);
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('my_tool');
    expect(defs[0].description).toBe('My tool desc');
    expect(defs[0].parameters.type).toBe('object');
  });

  it('executes registered tool', async () => {
    const tool: ToolHandler = {
      name: 'echo',
      description: 'Echoes input',
      parameters: {},
      execute: async (args) => ({
        toolCallId: '',
        content: `echo: ${args.text}`,
        isError: false,
      }),
    };
    registry.register(tool);
    const result = await registry.execute(
      { id: 'call-1', name: 'echo', arguments: JSON.stringify({ text: 'hello' }) },
      makeContext('/tmp'),
    );
    expect(result.content).toBe('echo: hello');
    expect(result.isError).toBe(false);
  });

  it('returns error for unknown tool', async () => {
    const result = await registry.execute(
      { id: 'call-1', name: 'unknown', arguments: '{}' },
      makeContext('/tmp'),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unknown tool');
  });

  it('returns error for invalid JSON arguments', async () => {
    const tool: ToolHandler = {
      name: 'test',
      description: 'Test',
      parameters: {},
      execute: async () => ({ toolCallId: '', content: 'ok', isError: false }),
    };
    registry.register(tool);
    const result = await registry.execute(
      { id: 'call-1', name: 'test', arguments: 'not-json' },
      makeContext('/tmp'),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Invalid JSON');
  });

  it('returns error when tool throws', async () => {
    const tool: ToolHandler = {
      name: 'thrower',
      description: 'Throws',
      parameters: {},
      execute: async () => { throw new Error('boom'); },
    };
    registry.register(tool);
    const result = await registry.execute(
      { id: 'call-1', name: 'thrower', arguments: '{}' },
      makeContext('/tmp'),
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Tool execution error');
    expect(result.content).toContain('boom');
  });

  it('overwrites tool with same name', () => {
    const tool1: ToolHandler = {
      name: 'x', description: 'v1', parameters: {},
      execute: async () => ({ toolCallId: '', content: 'v1', isError: false }),
    };
    const tool2: ToolHandler = {
      name: 'x', description: 'v2', parameters: {},
      execute: async () => ({ toolCallId: '', content: 'v2', isError: false }),
    };
    registry.register(tool1);
    registry.register(tool2);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get('x')!.description).toBe('v2');
  });
});

describe('filesystem tools', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  describe('read_file', () => {
    it('reads existing file with line numbers', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.writeFile(filePath, 'line1\nline2\nline3', 'utf-8');
      const result = await readFileTool.execute(
        { path: filePath },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('1: line1');
      expect(result.content).toContain('2: line2');
      expect(result.content).toContain('3: line3');
    });

    it('handles relative paths', async () => {
      const filePath = path.join(tmpDir, 'rel.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');
      const result = await readFileTool.execute(
        { path: 'rel.txt' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('content');
    });

    it('returns error for missing file', async () => {
      const result = await readFileTool.execute(
        { path: path.join(tmpDir, 'nonexistent.txt') },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('File not found');
    });

    it('returns error for directory', async () => {
      const result = await readFileTool.execute(
        { path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('directory');
    });

    it('respects offset and limit', async () => {
      const filePath = path.join(tmpDir, 'lines.txt');
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
      await fs.writeFile(filePath, lines, 'utf-8');
      const result = await readFileTool.execute(
        { path: filePath, offset: 10, limit: 5 },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('10: line 10');
      expect(result.content).toContain('14: line 14');
      expect(result.content).not.toMatch(/(?:^|\n)\s*1: line 1/);
    });

    it('returns permission denied when not approved', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');
      const result = await readFileTool.execute(
        { path: filePath },
        makeDenyContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Permission denied');
    });
  });

  describe('write_file', () => {
    it('creates new file', async () => {
      const filePath = path.join(tmpDir, 'new.txt');
      const result = await writeFileTool.execute(
        { path: filePath, content: 'hello world' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Wrote');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('hello world');
    });

    it('creates parent directories', async () => {
      const filePath = path.join(tmpDir, 'a', 'b', 'c', 'file.txt');
      const result = await writeFileTool.execute(
        { path: filePath, content: 'nested' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('nested');
    });

    it('overwrites existing file', async () => {
      const filePath = path.join(tmpDir, 'overwrite.txt');
      await fs.writeFile(filePath, 'old content', 'utf-8');
      const result = await writeFileTool.execute(
        { path: filePath, content: 'new content' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('new content');
    });

    it('returns permission denied when not approved', async () => {
      const result = await writeFileTool.execute(
        { path: path.join(tmpDir, 'x.txt'), content: 'data' },
        makeDenyContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Permission denied');
    });
  });

  describe('edit_file', () => {
    it('performs search and replace', async () => {
      const filePath = path.join(tmpDir, 'edit.txt');
      await fs.writeFile(filePath, 'hello world', 'utf-8');
      const result = await editFileTool.execute(
        { path: filePath, edits: [{ search: 'hello', replace: 'goodbye' }] },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Applied 1 edit');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('goodbye world');
    });

    it('applies multiple edits in order', async () => {
      const filePath = path.join(tmpDir, 'multi.txt');
      await fs.writeFile(filePath, 'aaa bbb ccc', 'utf-8');
      const result = await editFileTool.execute(
        {
          path: filePath,
          edits: [
            { search: 'aaa', replace: '111' },
            { search: 'bbb', replace: '222' },
          ],
        },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Applied 2 edit(s)');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('111 222 ccc');
    });

    it('returns error when search string not found', async () => {
      const filePath = path.join(tmpDir, 'edit-miss.txt');
      await fs.writeFile(filePath, 'hello world', 'utf-8');
      const result = await editFileTool.execute(
        { path: filePath, edits: [{ search: 'nonexistent', replace: 'x' }] },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('search string not found');
    });

    it('returns error when search string matches multiple locations', async () => {
      const filePath = path.join(tmpDir, 'edit-multi.txt');
      await fs.writeFile(filePath, 'aaa bbb aaa', 'utf-8');
      const result = await editFileTool.execute(
        { path: filePath, edits: [{ search: 'aaa', replace: 'xxx' }] },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('matches 2 locations');
    });

    it('returns error for missing file', async () => {
      const result = await editFileTool.execute(
        { path: path.join(tmpDir, 'nope.txt'), edits: [{ search: 'a', replace: 'b' }] },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('File not found');
    });

    it('returns error for empty edits array', async () => {
      const filePath = path.join(tmpDir, 'empty-edits.txt');
      await fs.writeFile(filePath, 'content', 'utf-8');
      const result = await editFileTool.execute(
        { path: filePath, edits: [] },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('non-empty array');
    });
  });

  describe('delete_file', () => {
    it('deletes existing file', async () => {
      const filePath = path.join(tmpDir, 'delete-me.txt');
      await fs.writeFile(filePath, 'bye', 'utf-8');
      const result = await deleteFileTool.execute(
        { path: filePath },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('Deleted');
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('returns error for missing file', async () => {
      const result = await deleteFileTool.execute(
        { path: path.join(tmpDir, 'nope.txt') },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('File not found');
    });

    it('returns error for directory', async () => {
      const result = await deleteFileTool.execute(
        { path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('directory');
    });
  });

  describe('list_directory', () => {
    it('lists files in directory', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b', 'utf-8');
      await fs.mkdir(path.join(tmpDir, 'subdir'));
      const result = await listDirectoryTool.execute(
        { path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('a.txt');
      expect(result.content).toContain('b.txt');
      expect(result.content).toContain('subdir/');
    });

    it('returns error for missing directory', async () => {
      const result = await listDirectoryTool.execute(
        { path: path.join(tmpDir, 'nonexistent') },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Directory not found');
    });

    it('returns error for file path', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      await fs.writeFile(filePath, 'x', 'utf-8');
      const result = await listDirectoryTool.execute(
        { path: filePath },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('not a directory');
    });

    it('hides hidden files by default', async () => {
      await fs.writeFile(path.join(tmpDir, '.hidden'), 'secret', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'visible.txt'), 'public', 'utf-8');
      const result = await listDirectoryTool.execute(
        { path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).not.toContain('.hidden');
      expect(result.content).toContain('visible.txt');
    });

    it('shows hidden files when showHidden is true', async () => {
      await fs.writeFile(path.join(tmpDir, '.hidden'), 'secret', 'utf-8');
      const result = await listDirectoryTool.execute(
        { path: tmpDir, showHidden: true },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('.hidden');
    });
  });

  describe('search_files', () => {
    it('finds pattern in files', async () => {
      await fs.writeFile(path.join(tmpDir, 'file1.ts'), 'const x = 1;', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'file2.ts'), 'const y = 2;', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'file3.txt'), 'no match here', 'utf-8');
      const result = await searchFilesTool.execute(
        { pattern: 'const', path: tmpDir, include: '*.ts' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('match');
      expect(result.content).toContain('file1.ts');
      expect(result.content).toContain('file2.ts');
    });

    it('returns no matches message when pattern not found', async () => {
      await fs.writeFile(path.join(tmpDir, 'plain.txt'), 'hello world', 'utf-8');
      const result = await searchFilesTool.execute(
        { pattern: 'nonexistent', path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('No matches found');
    });

    it('returns error for invalid regex', async () => {
      const result = await searchFilesTool.execute(
        { pattern: '[invalid', path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Invalid regex');
    });

    it('returns error for missing path', async () => {
      const result = await searchFilesTool.execute(
        { pattern: 'test', path: '/nonexistent/path' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Path not found');
    });
  });

  describe('glob_files', () => {
    it('finds files by glob pattern', async () => {
      await fs.mkdir(path.join(tmpDir, 'src'));
      await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export {}', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'src', 'utils.ts'), 'export {}', 'utf-8');
      await fs.writeFile(path.join(tmpDir, 'readme.md'), '# README', 'utf-8');
      const result = await globFilesTool.execute(
        { pattern: 'src/*.ts', path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('index.ts');
      expect(result.content).toContain('utils.ts');
      expect(result.content).not.toContain('readme.md');
    });

    it('returns no files message for no matches', async () => {
      await fs.writeFile(path.join(tmpDir, 'readme.md'), '# Hi', 'utf-8');
      const result = await globFilesTool.execute(
        { pattern: '**/*.xyz', path: tmpDir },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(false);
      expect(result.content).toContain('No files found');
    });

    it('returns error for missing path', async () => {
      const result = await globFilesTool.execute(
        { pattern: '*.ts', path: '/nonexistent/path' },
        makeContext(tmpDir),
      );
      expect(result.isError).toBe(true);
      expect(result.content).toContain('Path not found');
    });
  });
});
