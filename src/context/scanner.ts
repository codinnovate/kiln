import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve, join, extname, relative, basename } from 'node:path';
import { execSync } from 'node:child_process';
import type { RepoInfo, FileInfo } from './types.js';

const MAX_FILES = 10_000;
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '.nyc_output', '__pycache__', '.mypy_cache',
  '.tox', '.venv', 'venv', 'env', '.env',
  '.idea', '.vscode', '.vs', '.eclipse',
  'target', 'bin', 'obj', '.gradle',
  '.cache', '.parcel-cache', '.webpack',
  'tmp', 'temp', '.tmp', '.temp',
  '.turbo', '.vercel', '.netlify',
  'out', '.output', '.svelte-kit',
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'desktop.ini',
  '.env.local', '.env.development', '.env.production',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'Gemfile.lock', 'poetry.lock',
]);

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.c': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.h': 'C/C++ Header',
  '.hpp': 'C++ Header',
  '.cs': 'C#',
  '.php': 'PHP',
  '.scala': 'Scala',
  '.r': 'R',
  '.R': 'R',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.fish': 'Shell',
  '.ps1': 'PowerShell',
  '.sql': 'SQL',
  '.graphql': 'GraphQL',
  '.gql': 'GraphQL',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'Less',
  '.sass': 'Sass',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.xml': 'XML',
  '.svg': 'SVG',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.json': 'JSON',
  '.jsonc': 'JSON',
  '.toml': 'TOML',
  '.ini': 'INI',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.txt': 'Text',
  '.dockerfile': 'Dockerfile',
  '.makefile': 'Makefile',
  '.cmake': 'CMake',
  '.proto': 'Protocol Buffers',
};

function parseGitignore(root: string): Set<string> {
  const patterns = new Set<string>();

  try {
    const content = require('node:fs').readFileSync(resolve(root, '.gitignore'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.add(trimmed);
      }
    }
  } catch {
    // No .gitignore
  }

  return patterns;
}

function matchesGitignorePattern(path: string, pattern: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  if (normalizedPattern.includes('*')) {
    const regex = new RegExp(
      '^' + normalizedPattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
    );
    return regex.test(normalizedPath);
  }

  if (normalizedPattern.endsWith('/')) {
    return normalizedPath.startsWith(normalizedPattern) || normalizedPath.includes('/' + normalizedPattern);
  }

  return normalizedPath === normalizedPattern || normalizedPath.endsWith('/' + normalizedPattern);
}

function shouldIgnore(filePath: string, root: string, gitignorePatterns: Set<string>): boolean {
  const relativePath = relative(root, filePath);
  const parts = relativePath.split('/');
  const fileName = basename(filePath);
  const ext = extname(filePath).toLowerCase();

  if (IGNORE_FILES.has(fileName)) return true;
  if (BINARY_EXTENSIONS.has(ext)) return true;

  for (const part of parts) {
    if (IGNORE_DIRS.has(part)) return true;
  }

  if (parts.length > 1) {
    const dirName = parts[parts.length - 2];
    if (dirName === '.git') return true;
  }

  if (ext === '.log' || ext === '.lock' || ext === '.min.js' || ext === '.min.css') return true;

  for (const pattern of gitignorePatterns) {
    if (matchesGitignorePattern(relativePath, pattern)) return true;
  }

  return false;
}

async function scanDirectory(
  dir: string,
  root: string,
  gitignorePatterns: Set<string>,
  files: FileInfo[],
  maxFiles: number,
  maxDepth: number = 20,
  currentDepth: number = 0,
): Promise<boolean> {
  if (currentDepth > maxDepth || files.length >= maxFiles) return false;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  const subdirs: { entry: import('node:fs').Dirent; fullPath: string }[] = [];

  for (const entry of entries) {
    if (files.length >= maxFiles) return false;

    const fullPath = join(dir, entry.name);

    if (shouldIgnore(fullPath, root, gitignorePatterns)) continue;

    try {
      const fileStat = await stat(fullPath);

      const ext = extname(entry.name).toLowerCase();
      const language = EXTENSION_TO_LANGUAGE[ext] || undefined;

      const info: FileInfo = {
        path: relative(root, fullPath),
        size: fileStat.size,
        type: entry.isDirectory() ? 'directory' : 'file',
        extension: ext,
        lastModified: fileStat.mtime,
        language,
      };

      files.push(info);

      if (entry.isDirectory()) {
        subdirs.push({ entry, fullPath });
      }
    } catch {
      // Skip inaccessible files
    }
  }

  if (subdirs.length > 0) {
    const results = await Promise.all(
      subdirs.map((s) =>
        scanDirectory(s.fullPath, root, gitignorePatterns, files, maxFiles, maxDepth, currentDepth + 1),
      ),
    );
    if (results.some((r) => r === false)) return false;
  }

  return true;
}

function getGitStatus(root: string): string | undefined {
  try {
    return execSync('git status --short', { cwd: root, encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return undefined;
  }
}

function getRecentCommits(root: string, count: number = 10): string[] | undefined {
  try {
    const output = execSync(
      `git log --oneline -n ${count}`,
      { cwd: root, encoding: 'utf-8', timeout: 5000 },
    ).trim();
    return output.split('\n').filter(Boolean);
  } catch {
    return undefined;
  }
}

async function readPackageJson(root: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await readFile(resolve(root, 'package.json'), 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function scanRepository(root: string, maxFiles: number = MAX_FILES): Promise<RepoInfo> {
  const resolvedRoot = resolve(root);
  const gitignorePatterns = parseGitignore(resolvedRoot);
  const files: FileInfo[] = [];

  await scanDirectory(resolvedRoot, resolvedRoot, gitignorePatterns, files, maxFiles);

  const languages: Record<string, number> = {};
  let totalSize = 0;
  let fileCount = 0;

  for (const file of files) {
    if (file.type === 'file') {
      fileCount++;
      totalSize += file.size;
      if (file.language) {
        languages[file.language] = (languages[file.language] || 0) + 1;
      }
    }
  }

  const [packageJson, gitStatus, recentCommits] = await Promise.all([
    readPackageJson(resolvedRoot),
    Promise.resolve(getGitStatus(resolvedRoot)),
    Promise.resolve(getRecentCommits(resolvedRoot)),
  ]);

  return {
    root: resolvedRoot,
    files,
    packageJson,
    gitStatus,
    recentCommits,
    languages,
    totalFiles: fileCount,
    totalSize,
  };
}
