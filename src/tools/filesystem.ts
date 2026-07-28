import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolHandler } from './registry.js';

const MAX_OUTPUT_SIZE = 100_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIRECTORY_ENTRIES = 1000;
const SEARCH_CONTEXT_LINES = 3;

function resolveFilePath(filePath: string, cwd: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(cwd, filePath);
}

function truncateOutput(content: string, maxLen: number = MAX_OUTPUT_SIZE): string {
  if (content.length <= maxLen) return content;
  const truncated = content.slice(0, maxLen);
  return `${truncated}\n\n[Output truncated at ${maxLen} characters]`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const buffer = Buffer.alloc(512);
    const fh = await fs.open(filePath, 'r');
    try {
      const { bytesRead } = await fh.read(buffer, 0, 512, 0);
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) return true;
      }
      return false;
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

export const readFileTool: ToolHandler = {
  name: 'read_file',
  description:
    'Read the contents of a file. Returns content with line numbers. Use offset and limit to read specific sections of large files. Returns an error if the file does not exist or is a binary file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-indexed). Defaults to 1.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read. Defaults to 2000.',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const filePath = resolveFilePath(args.path as string, context.cwd);
    const offset = Math.max(1, (args.offset as number) || 1);
    const limit = Math.min(10_000, Math.max(1, (args.limit as number) || 2000));

    if (!context.permissions.approve(filePath, 'read')) {
      return { toolCallId: '', content: `Permission denied: ${filePath}`, isError: true };
    }

    try {
      await fs.access(filePath);
    } catch {
      return { toolCallId: '', content: `File not found: ${filePath}`, isError: true };
    }

    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      return { toolCallId: '', content: `Path is a directory, not a file: ${filePath}`, isError: true };
    }

    if (stat.size > MAX_FILE_SIZE) {
      return {
        toolCallId: '',
        content: `File too large (${formatSize(stat.size)}): ${filePath}. Maximum readable size is ${formatSize(MAX_FILE_SIZE)}. Use offset and limit to read specific sections, or use search_files to find content.`,
        isError: true,
      };
    }

    if (await isBinaryFile(filePath)) {
      return {
        toolCallId: '',
        content: `Binary file detected (${formatSize(stat.size)}): ${filePath}. Cannot display content.`,
        isError: true,
      };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const endLine = Math.min(offset - 1 + limit, totalLines);
    const selectedLines = lines.slice(offset - 1, endLine);

    const numbered = selectedLines
      .map((line, i) => `${String(offset + i).padStart(4)}: ${line}`)
      .join('\n');

    const header = `File: ${filePath} (${totalLines} lines, ${formatSize(stat.size)})`;
    const range = offset === 1 && endLine === totalLines
      ? ''
      : `\nShowing lines ${offset}-${endLine} of ${totalLines}`;

    return {
      toolCallId: '',
      content: truncateOutput(header + range + '\n\n' + numbered),
      isError: false,
    };
  },
};

export const writeFileTool: ToolHandler = {
  name: 'write_file',
  description:
    'Write content to a file, creating it and any parent directories if they do not exist. Overwrites existing content. Use this to create new files or completely replace file contents.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to write',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const filePath = resolveFilePath(args.path as string, context.cwd);
    const content = args.content as string;

    if (typeof content !== 'string') {
      return { toolCallId: '', content: 'Content must be a string', isError: true };
    }

    if (!context.permissions.approve(filePath, 'write')) {
      return { toolCallId: '', content: `Permission denied: ${filePath}`, isError: true };
    }

    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      const lines = content.split('\n').length;
      return {
        toolCallId: '',
        content: `Wrote ${lines} lines (${formatSize(Buffer.byteLength(content, 'utf-8'))}) to ${filePath}`,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { toolCallId: '', content: `Failed to write file: ${msg}`, isError: true };
    }
  },
};

export const editFileTool: ToolHandler = {
  name: 'edit_file',
  description:
    'Make precise edits to a file using search-and-replace. Each edit performs an exact string match and replaces it. Returns an error if any search string is not found. Use this for targeted changes without rewriting the entire file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to edit',
      },
      edits: {
        type: 'array',
        description: 'Array of search/replace pairs to apply in order',
        items: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Exact string to find in the file',
            },
            replace: {
              type: 'string',
              description: 'String to replace it with',
            },
          },
          required: ['search', 'replace'],
          additionalProperties: false,
        },
      },
    },
    required: ['path', 'edits'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const filePath = resolveFilePath(args.path as string, context.cwd);
    const edits = args.edits as Array<{ search: string; replace: string }>;

    if (!Array.isArray(edits) || edits.length === 0) {
      return { toolCallId: '', content: 'edits must be a non-empty array', isError: true };
    }

    if (!context.permissions.approve(filePath, 'write')) {
      return { toolCallId: '', content: `Permission denied: ${filePath}`, isError: true };
    }

    try {
      await fs.access(filePath);
    } catch {
      return { toolCallId: '', content: `File not found: ${filePath}`, isError: true };
    }

    const editStat = await fs.stat(filePath);
    if (editStat.size > MAX_FILE_SIZE) {
      return {
        toolCallId: '',
        content: `File too large (${formatSize(editStat.size)}): ${filePath}. Cannot edit files larger than ${formatSize(MAX_FILE_SIZE)}.`,
        isError: true,
      };
    }

    if (await isBinaryFile(filePath)) {
      return {
        toolCallId: '',
        content: `Binary file detected: ${filePath}. Cannot edit binary files.`,
        isError: true,
      };
    }

    let content = await fs.readFile(filePath, 'utf-8');
    const results: string[] = [];

    for (let i = 0; i < edits.length; i++) {
      const { search, replace } = edits[i];
      if (typeof search !== 'string' || typeof replace !== 'string') {
        return {
          toolCallId: '',
          content: `Edit ${i + 1}: search and replace must be strings`,
          isError: true,
        };
      }

      const count = content.split(search).length - 1;
      if (count === 0) {
        const preview = search.length > 80 ? search.slice(0, 80) + '...' : search;
        return {
          toolCallId: '',
          content: `Edit ${i + 1}: search string not found in ${filePath}\n\nSearched for:\n${preview}`,
          isError: true,
        };
      }

      if (count > 1) {
        return {
          toolCallId: '',
          content: `Edit ${i + 1}: search string matches ${count} locations in ${filePath}. Provide more context to make it unique.`,
          isError: true,
        };
      }

      content = content.replace(search, replace);
      const searchPreview = search.length > 60 ? search.slice(0, 60) + '...' : search;
      const replacePreview = replace.length > 60 ? replace.slice(0, 60) + '...' : replace;
      results.push(`Edit ${i + 1}: replaced "${searchPreview}" with "${replacePreview}"`);
    }

    await fs.writeFile(filePath, content, 'utf-8');

    return {
      toolCallId: '',
      content: `Applied ${edits.length} edit(s) to ${filePath}:\n${results.join('\n')}`,
      isError: false,
    };
  },
};

export const deleteFileTool: ToolHandler = {
  name: 'delete_file',
  description:
    'Delete a file. The file must exist. This action is irreversible. Use with caution.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file to delete',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const filePath = resolveFilePath(args.path as string, context.cwd);

    if (!context.permissions.approve(filePath, 'delete')) {
      return { toolCallId: '', content: `Permission denied: ${filePath}`, isError: true };
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return {
          toolCallId: '',
          content: `Path is a directory, not a file: ${filePath}. Use rm -r for directories.`,
          isError: true,
        };
      }
      await fs.unlink(filePath);
      return {
        toolCallId: '',
        content: `Deleted ${filePath} (${formatSize(stat.size)})`,
        isError: false,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { toolCallId: '', content: `File not found: ${filePath}`, isError: true };
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { toolCallId: '', content: `Failed to delete file: ${msg}`, isError: true };
    }
  },
};

export const listDirectoryTool: ToolHandler = {
  name: 'list_directory',
  description:
    'List the contents of a directory. Returns entries with their type (file, directory, symlink) and size. Use showHidden to include dotfiles.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Absolute or relative path to the directory. Defaults to the current working directory.',
      },
      showHidden: {
        type: 'boolean',
        description: 'Include hidden files and directories (dotfiles). Defaults to false.',
      },
    },
    additionalProperties: false,
  },

  async execute(args, context) {
    const dirPath = args.path ? resolveFilePath(args.path as string, context.cwd) : context.cwd;
    const showHidden = (args.showHidden as boolean) ?? false;

    if (!context.permissions.approve(dirPath, 'read')) {
      return { toolCallId: '', content: `Permission denied: ${dirPath}`, isError: true };
    }

    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return {
          toolCallId: '',
          content: `Path is not a directory: ${dirPath}`,
          isError: true,
        };
      }
    } catch {
      return { toolCallId: '', content: `Directory not found: ${dirPath}`, isError: true };
    }

    try {
      let entries = await fs.readdir(dirPath, { withFileTypes: true });

      if (!showHidden) {
        entries = entries.filter((e) => !e.name.startsWith('.'));
      }

      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      const totalEntries = entries.length;
      const truncated = entries.length > MAX_DIRECTORY_ENTRIES;
      if (truncated) {
        entries = entries.slice(0, MAX_DIRECTORY_ENTRIES);
      }

      const lines: string[] = [];

      // Add parent directory reference if not root
      if (dirPath !== path.dirname(dirPath)) {
        lines.push('  ../     (parent directory)');
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const typeChar = entry.isDirectory() ? '/' : entry.isSymbolicLink() ? '@' : ' ';
        let sizeStr = '';

        try {
          let entryStat: import('node:fs').Stats;
          try {
            entryStat = await fs.stat(fullPath);
          } catch {
            entryStat = await fs.lstat(fullPath);
          }
          sizeStr = formatSize(entryStat.size).padStart(8);
        } catch {
          sizeStr = '       ?';
        }

        const name = entry.isDirectory() ? `${entry.name}/` : entry.name;
        lines.push(`${sizeStr}  ${typeChar} ${name}`);
      }

      const header = `Directory: ${dirPath} (${totalEntries} entries)`;
      const suffix = truncated
        ? `\n\n[Showing first ${MAX_DIRECTORY_ENTRIES} of ${totalEntries} entries. Results truncated.]`
        : '';
      return {
        toolCallId: '',
        content: truncateOutput(header + '\n\n' + lines.join('\n') + suffix),
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { toolCallId: '', content: `Failed to list directory: ${msg}`, isError: true };
    }
  },
};

export const searchFilesTool: ToolHandler = {
  name: 'search_files',
  description:
    'Search file contents using a regular expression pattern. Returns matching lines with file paths, line numbers, and surrounding context. Use the include parameter to filter by file type (e.g. "*.ts").',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description:
          'Directory or file path to search in. Defaults to the current working directory.',
      },
      include: {
        type: 'string',
        description: 'Glob pattern to filter which files to search (e.g. "*.ts", "*.{js,ts}")',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const searchPath = args.path
      ? resolveFilePath(args.path as string, context.cwd)
      : context.cwd;
    const include = args.include as string | undefined;

    let regex: RegExp;
    try {
      regex = new RegExp(args.pattern as string, 'gm');
    } catch {
      return {
        toolCallId: '',
        content: `Invalid regex pattern: ${args.pattern}`,
        isError: true,
      };
    }

    if (!context.permissions.approve(searchPath, 'read')) {
      return { toolCallId: '', content: `Permission denied: ${searchPath}`, isError: true };
    }

    const stat = await fs.stat(searchPath).catch(() => null);
    if (!stat) {
      return { toolCallId: '', content: `Path not found: ${searchPath}`, isError: true };
    }

    // Collect files to search
    const filesToSearch: string[] = [];
    if (stat.isFile()) {
      filesToSearch.push(searchPath);
    } else {
      await collectFiles(searchPath, include, filesToSearch);
    }

    const matches: string[] = [];
    let matchCount = 0;
    const maxMatches = 200;

    for (const filePath of filesToSearch) {
      if (matchCount >= maxMatches) break;

      if (await isBinaryFile(filePath)) continue;

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      regex.lastIndex = 0;

      for (let i = 0; i < lines.length; i++) {
        if (matchCount >= maxMatches) break;
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          matchCount++;
          const start = Math.max(0, i - SEARCH_CONTEXT_LINES);
          const end = Math.min(lines.length - 1, i + SEARCH_CONTEXT_LINES);
          const contextLines: string[] = [];
          for (let j = start; j <= end; j++) {
            const marker = j === i ? '>' : ' ';
            contextLines.push(`${String(j + 1).padStart(4)} ${marker} ${lines[j]}`);
          }
          matches.push(`--- ${path.relative(context.cwd, filePath)}:${i + 1} ---\n${contextLines.join('\n')}`);
        }
      }
    }

    if (matches.length === 0) {
      return {
        toolCallId: '',
        content: `No matches found for /${args.pattern}/ in ${searchPath}`,
        isError: false,
      };
    }

    const suffix = matchCount >= maxMatches
      ? `\n\n[Showing first ${maxMatches} matches. Results truncated.]`
      : '';

    return {
      toolCallId: '',
      content: truncateOutput(
        `Found ${matchCount} match(es) in ${searchPath}:\n\n${matches.join('\n\n')}${suffix}`
      ),
      isError: false,
    };
  },
};

async function collectFiles(
  dir: string,
  include: string | undefined,
  results: string[],
  maxFiles: number = 5000
): Promise<void> {
  if (results.length >= maxFiles) return;

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) return;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, include, results, maxFiles);
    } else if (entry.isFile()) {
      if (include) {
        const pattern = globToRegex(include);
        if (!pattern.test(entry.name)) continue;
      }
      results.push(fullPath);
    }
  }
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(',').join('|')})`)
    .replace(/{{GLOBSTAR}}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export const globFilesTool: ToolHandler = {
  name: 'glob_files',
  description:
    'Find files matching a glob pattern. Returns a list of matching file paths. Supports standard glob syntax including *, **, ?, and {a,b} alternatives.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description:
          'Glob pattern to match files against (e.g. "src/**/*.ts", "*.json", "tests/*.{test,spec}.ts")',
      },
      path: {
        type: 'string',
        description: 'Directory to search from. Defaults to the current working directory.',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const searchPath = args.path
      ? resolveFilePath(args.path as string, context.cwd)
      : context.cwd;

    if (!context.permissions.approve(searchPath, 'read')) {
      return { toolCallId: '', content: `Permission denied: ${searchPath}`, isError: true };
    }

    try {
      await fs.access(searchPath);
    } catch {
      return { toolCallId: '', content: `Path not found: ${searchPath}`, isError: true };
    }

    // Build the full glob: if pattern is relative, combine with searchPath
    const fullPattern = path.isAbsolute(args.pattern as string)
      ? (args.pattern as string)
      : path.join(searchPath, args.pattern as string);

    // Use Node.js fs.readdir with recursive option (Node 18.17+)
    const files: string[] = [];
    const regex = globToRegex(fullPattern);

    async function walkDir(dir: string): Promise<void> {
      if (files.length >= 5000) return;

      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= 5000) return;
        if (entry.name.startsWith('.')) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.isFile() && regex.test(fullPath)) {
          files.push(fullPath);
        }
      }
    }

    await walkDir(searchPath);

    if (files.length === 0) {
      return {
        toolCallId: '',
        content: `No files found matching pattern: ${args.pattern}`,
        isError: false,
      };
    }

    // Make paths relative to cwd for readability
    const relative = files.map((f) => path.relative(context.cwd, f)).sort();

    const suffix = files.length >= 5000 ? '\n\n[Results truncated at 5000 files]' : '';
    return {
      toolCallId: '',
      content: truncateOutput(
        `Found ${files.length} file(s):\n${relative.join('\n')}${suffix}`
      ),
      isError: false,
    };
  },
};

export const getFileInfoTool: ToolHandler = {
  name: 'get_file_info',
  description:
    'Get metadata about a file or directory: size, modified date, type, and permissions. Useful for checking if a file exists or getting its size without reading contents.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute or relative path to the file or directory',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },

  async execute(args, context) {
    const filePath = resolveFilePath(args.path as string, context.cwd);

    if (!context.permissions.approve(filePath, 'read')) {
      return { toolCallId: '', content: `Permission denied: ${filePath}`, isError: true };
    }

    try {
      const stat = await fs.stat(filePath);
      const type = stat.isDirectory()
        ? 'directory'
        : stat.isSymbolicLink()
          ? 'symlink'
          : stat.isFile()
            ? 'file'
            : 'other';

      const modeOctal = (stat.mode & 0o777).toString(8);
      const lines = [
        `Path: ${filePath}`,
        `Type: ${type}`,
        `Size: ${formatSize(stat.size)} (${stat.size.toLocaleString()} bytes)`,
        `Modified: ${stat.mtime.toISOString()}`,
        `Created: ${stat.birthtime.toISOString()}`,
        `Permissions: ${modeOctal}`,
        `Owner UID: ${stat.uid}`,
        `Group GID: ${stat.gid}`,
      ];

      if (type === 'file') {
        const ext = path.extname(filePath);
        if (ext) lines.push(`Extension: ${ext}`);
      }

      return {
        toolCallId: '',
        content: lines.join('\n'),
        isError: false,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { toolCallId: '', content: `File not found: ${filePath}`, isError: true };
      }
      const msg = error instanceof Error ? error.message : String(error);
      return { toolCallId: '', content: `Failed to get file info: ${msg}`, isError: true };
    }
  },
};

export const filesystemTools: ToolHandler[] = [
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirectoryTool,
  searchFilesTool,
  globFilesTool,
  getFileInfoTool,
];
