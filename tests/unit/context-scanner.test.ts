import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanRepository } from '../../src/context/scanner.js';

function createTempDir(): string {
  return fsSync.mkdtempSync(path.join(os.tmpdir(), 'kiln-scanner-test-'));
}

async function writeFile(dir: string, relPath: string, content: string): Promise<void> {
  const full = path.join(dir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf-8');
}

describe('scanRepository', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = createTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns root as resolved absolute path', async () => {
    const info = await scanRepository(tmpDir);
    expect(path.isAbsolute(info.root)).toBe(true);
    expect(info.root).toBe(tmpDir);
  });

  it('counts files and directories separately', async () => {
    await writeFile(tmpDir, 'src/index.ts', 'export {}');
    await writeFile(tmpDir, 'src/utils.ts', 'export {}');
    await fs.mkdir(path.join(tmpDir, 'src', 'helpers'));
    await writeFile(tmpDir, 'README.md', '# Hi');

    const info = await scanRepository(tmpDir);

    const tsFiles = info.files.filter(
      (f) => f.type === 'file' && f.language === 'TypeScript',
    );
    expect(tsFiles).toHaveLength(2);

    const dirs = info.files.filter((f) => f.type === 'directory');
    expect(dirs.some((d) => d.path === 'src')).toBe(true);
    expect(dirs.some((d) => d.path === 'src/helpers')).toBe(true);
  });

  it('populates file sizes', async () => {
    const content = 'const x = 12345;';
    await writeFile(tmpDir, 'code.ts', content);

    const info = await scanRepository(tmpDir);
    const file = info.files.find((f) => f.path === 'code.ts');
    expect(file).toBeDefined();
    expect(file!.size).toBe(Buffer.byteLength(content, 'utf-8'));
    expect(file!.size).toBeGreaterThan(0);
  });

  it('sets extension and language on .ts files', async () => {
    await writeFile(tmpDir, 'app.ts', 'code');
    await writeFile(tmpDir, 'app.tsx', 'code');

    const info = await scanRepository(tmpDir);
    const ts = info.files.find((f) => f.path === 'app.ts');
    const tsx = info.files.find((f) => f.path === 'app.tsx');

    expect(ts!.extension).toBe('.ts');
    expect(ts!.language).toBe('TypeScript');
    expect(tsx!.extension).toBe('.tsx');
    expect(tsx!.language).toBe('TypeScript');
  });

  it('sets lastModified as Date', async () => {
    await writeFile(tmpDir, 'dated.ts', 'code');

    const info = await scanRepository(tmpDir);
    const file = info.files.find((f) => f.path === 'dated.ts');
    expect(file!.lastModified).toBeInstanceOf(Date);
  });

  it('ignores node_modules directory and all its contents', async () => {
    await writeFile(tmpDir, 'src/main.ts', 'code');
    await writeFile(tmpDir, 'node_modules/lodash/index.js', '');
    await writeFile(tmpDir, 'node_modules/.package-lock.json', '{}');

    const info = await scanRepository(tmpDir);
    const nmFiles = info.files.filter((f) => f.path.startsWith('node_modules'));
    expect(nmFiles).toHaveLength(0);
    expect(info.totalFiles).toBe(1);
  });

  it('ignores .git directory', async () => {
    await writeFile(tmpDir, 'src/app.ts', 'code');
    await writeFile(tmpDir, '.git/config', '[core]');
    await writeFile(tmpDir, '.git/HEAD', 'ref: refs/heads/main');

    const info = await scanRepository(tmpDir);
    const gitFiles = info.files.filter((f) => f.path.startsWith('.git'));
    expect(gitFiles).toHaveLength(0);
  });

  it('ignores dist and build directories', async () => {
    await writeFile(tmpDir, 'src/index.ts', 'code');
    await writeFile(tmpDir, 'dist/bundle.js', '');
    await writeFile(tmpDir, 'build/output.js', '');

    const info = await scanRepository(tmpDir);
    const ignored = info.files.filter(
      (f) => f.path.startsWith('dist') || f.path.startsWith('build'),
    );
    expect(ignored).toHaveLength(0);
    expect(info.totalFiles).toBe(1);
  });

  it('ignores .DS_Store and other system files', async () => {
    await writeFile(tmpDir, 'src/app.ts', 'code');
    await writeFile(tmpDir, '.DS_Store', '');
    await writeFile(tmpDir, 'Thumbs.db', '');

    const info = await scanRepository(tmpDir);
    const systemFiles = info.files.filter(
      (f) => f.path === '.DS_Store' || f.path === 'Thumbs.db',
    );
    expect(systemFiles).toHaveLength(0);
  });

  it('ignores lockfiles', async () => {
    await writeFile(tmpDir, 'src/index.ts', 'code');
    await writeFile(tmpDir, 'package-lock.json', '{}');
    await writeFile(tmpDir, 'yarn.lock', '');
    await writeFile(tmpDir, 'pnpm-lock.yaml', '');
    await writeFile(tmpDir, 'Cargo.lock', '');

    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(1);
  });

  it('ignores .log files', async () => {
    await writeFile(tmpDir, 'src/app.ts', 'code');
    await writeFile(tmpDir, 'debug.log', 'log content');

    const info = await scanRepository(tmpDir);
    const logFiles = info.files.filter((f) => f.path === 'debug.log');
    expect(logFiles).toHaveLength(0);
    expect(info.totalFiles).toBe(1);
  });

  it('detects TypeScript language', async () => {
    await writeFile(tmpDir, 'index.ts', 'code');
    await writeFile(tmpDir, 'component.tsx', 'code');

    const info = await scanRepository(tmpDir);
    expect(info.languages.TypeScript).toBe(2);
  });

  it('detects multiple languages', async () => {
    await writeFile(tmpDir, 'app.ts', '');
    await writeFile(tmpDir, 'style.css', '');
    await writeFile(tmpDir, 'readme.md', '');
    await writeFile(tmpDir, 'main.py', '');
    await writeFile(tmpDir, 'go.mod', '');

    const info = await scanRepository(tmpDir);
    expect(info.languages.TypeScript).toBe(1);
    expect(info.languages.CSS).toBe(1);
    expect(info.languages.Markdown).toBe(1);
    expect(info.languages.Python).toBe(1);
  });

  it('reads package.json metadata', async () => {
    const pkg = {
      name: 'my-test-project',
      version: '2.0.0',
      dependencies: { lodash: '^4.17.21' },
    };
    await writeFile(tmpDir, 'package.json', JSON.stringify(pkg));
    await writeFile(tmpDir, 'src/index.ts', 'code');

    const info = await scanRepository(tmpDir);
    expect(info.packageJson).toBeDefined();
    expect(info.packageJson!.name).toBe('my-test-project');
    expect(info.packageJson!.version).toBe('2.0.0');
  });

  it('returns undefined packageJson when not present', async () => {
    await writeFile(tmpDir, 'index.ts', 'code');

    const info = await scanRepository(tmpDir);
    expect(info.packageJson).toBeUndefined();
  });

  it('returns undefined gitStatus when not in a git repo', async () => {
    await writeFile(tmpDir, 'index.ts', 'code');

    const info = await scanRepository(tmpDir);
    expect(info.gitStatus).toBeUndefined();
    expect(info.recentCommits).toBeUndefined();
  });

  it('handles an empty directory', async () => {
    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(0);
    expect(info.totalSize).toBe(0);
    expect(info.languages).toEqual({});
    expect(info.files).toHaveLength(0);
  });

  it('accumulates totalSize across files', async () => {
    await writeFile(tmpDir, 'a.ts', 'aaa');
    await writeFile(tmpDir, 'b.ts', 'bbbbb');

    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(2);
    expect(info.totalSize).toBe(8);
  });

  it('ignores .coverage and .nyc_output directories', async () => {
    await writeFile(tmpDir, 'src/index.ts', 'code');
    await writeFile(tmpDir, 'coverage/lcov-report/index.html', '');
    await writeFile(tmpDir, '.nyc_output/out.json', '');

    const info = await scanRepository(tmpDir);
    expect(info.totalFiles).toBe(1);
  });

  it('ignores .env files', async () => {
    await writeFile(tmpDir, 'src/index.ts', 'code');
    await writeFile(tmpDir, '.env', 'SECRET=key');
    await writeFile(tmpDir, '.env.local', 'LOCAL=val');

    const info = await scanRepository(tmpDir);
    const envFiles = info.files.filter((f) => f.path.startsWith('.env'));
    expect(envFiles).toHaveLength(0);
  });

  it('detects Vue and Svelte files', async () => {
    await writeFile(tmpDir, 'App.vue', '<template></template>');
    await writeFile(tmpDir, 'page.svelte', '<script></script>');

    const info = await scanRepository(tmpDir);
    expect(info.languages.Vue).toBe(1);
    expect(info.languages.Svelte).toBe(1);
  });

  it('respects .gitignore patterns', async () => {
    await writeFile(tmpDir, 'src/index.ts', 'code');
    await writeFile(tmpDir, '.gitignore', 'ignored/\n*.tmp\n');
    await writeFile(tmpDir, 'ignored/file.txt', 'secret');
    await writeFile(tmpDir, 'temp.tmp', 'tmp');

    const info = await scanRepository(tmpDir);
    const ignoredFiles = info.files.filter(
      (f) => f.path.startsWith('ignored/') || f.path.endsWith('.tmp'),
    );
    expect(ignoredFiles).toHaveLength(0);
    const srcFile = info.files.find((f) => f.path === 'src/index.ts');
    expect(srcFile).toBeDefined();
    expect(srcFile!.type).toBe('file');
  });
});
