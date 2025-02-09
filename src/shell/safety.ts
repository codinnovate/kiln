export type CommandSafety = 'safe' | 'moderate' | 'dangerous' | 'blocked';

export interface SafetyResult {
  level: CommandSafety;
  reason: string;
  suggestion?: string;
}

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-\w*\s+)*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\/(\s|$)/, reason: 'Recursive delete of root filesystem' },
  { pattern: /\brm\s+(-\w*\s+)*-[a-zA-Z]*f[a-zA-Z]*[a-zA-Z]*r[a-zA-Z]*\s+\/(\s|$)/, reason: 'Recursive force delete of root filesystem' },
  { pattern: /\bmkfs\b/, reason: 'Filesystem format command' },
  { pattern: /\bdd\b.*\bof=\/dev\//, reason: 'Raw disk write operation' },
  { pattern: /\bformat\b/, reason: 'Disk format command' },
  { pattern: /\bshutdown\b/, reason: 'System shutdown' },
  { pattern: /\breboot\b/, reason: 'System reboot' },
  { pattern: /\bhalt\b/, reason: 'System halt' },
  { pattern: /\binit\s+0\b/, reason: 'System shutdown via init' },
  { pattern: /:\(\)\s*\{\s*:\|:\&\s*\};:/, reason: 'Fork bomb' },
  { pattern: /\b:\(\)\s*\{/, reason: 'Potential fork bomb' },
  { pattern: /\bmv\s+\/\s+/, reason: 'Moving root filesystem' },
  { pattern: /\bchmod\s+777\s+\//, reason: 'Setting world-writable permissions on root' },
  { pattern: /\bchown\s+.*\s+\/(\s|$)/, reason: 'Changing ownership of root filesystem' },
];

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string; suggestion?: string }> = [
  { pattern: /\brm\s+(-\w*\s+)*-[a-zA-Z]*r[a-zA-Z]*\s+/, reason: 'Recursive directory deletion', suggestion: 'Be careful with recursive deletion. Consider dry-run first.' },
  { pattern: /\brm\s+(-\w*\s+)*-[a-zA-Z]*f[a-zA-Z]*\s+/, reason: 'Force deletion without confirmation', suggestion: 'Force delete bypasses safety checks.' },
  { pattern: /\brm\s+/, reason: 'File deletion', suggestion: 'Deleted files cannot be recovered.' },
  { pattern: /\bgit\s+push\s+--force\b/, reason: 'Force push to remote', suggestion: 'Force push can overwrite others work. Consider --force-with-lease.' },
  { pattern: /\bgit\s+push\s+-f\b/, reason: 'Force push to remote', suggestion: 'Force push can overwrite others work. Consider --force-with-lease.' },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'Hard reset discards all local changes', suggestion: 'Hard reset loses uncommitted work. Consider --soft or --mixed first.' },
  { pattern: /\bgit\s+clean\s+-fd\b/, reason: 'Removes all untracked files and directories', suggestion: 'This permanently deletes untracked files.' },
  { pattern: /\bgit\s+clean\s+-fdx\b/, reason: 'Removes all untracked files including ignored', suggestion: 'This removes everything not tracked by git.' },
  { pattern: /\bchmod\s+777\b/, reason: 'World-writable permissions', suggestion: 'Use more restrictive permissions.' },
  { pattern: /\bchmod\s+000\b/, reason: 'Removes all permissions', suggestion: 'This can lock you out of files.' },
  { pattern: /\b>\s*\/dev\/sd[a-z]/, reason: 'Raw disk write', suggestion: 'This can destroy disk contents.' },
  { pattern: /\bcurl\b.*\|\s*(sh|bash)\b/, reason: 'Piping remote script to shell', suggestion: 'Download and inspect the script first.' },
  { pattern: /\bwget\b.*\|\s*(sh|bash)\b/, reason: 'Piping remote script to shell', suggestion: 'Download and inspect the script first.' },
  { pattern: /\bgit\s+push\b.*\+\s/, reason: 'Force push using + syntax', suggestion: 'Force push can overwrite others work.' },
  { pattern: /\bgit\s+branch\s+-D\b/, reason: 'Force delete branch', suggestion: 'Branch deletion is permanent if not merged.' },
];

const MODERATE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bnpm\s+install\b/, reason: 'Package installation' },
  { pattern: /\bnpm\s+i\b/, reason: 'Package installation' },
  { pattern: /\bnpm\s+ci\b/, reason: 'Clean install from lockfile' },
  { pattern: /\bnpm\s+update\b/, reason: 'Package update' },
  { pattern: /\bnpm\s+run\b/, reason: 'Run npm script' },
  { pattern: /\bnpx\b/, reason: 'Execute package binary' },
  { pattern: /\byarn\s+(add|remove|install)\b/, reason: 'Yarn package management' },
  { pattern: /\bpnpm\s+(add|remove|install)\b/, reason: 'Pnpm package management' },
  { pattern: /\bpip\s+install\b/, reason: 'Python package installation' },
  { pattern: /\bpip3\s+install\b/, reason: 'Python package installation' },
  { pattern: /\bgit\s+add\b/, reason: 'Stage files for commit' },
  { pattern: /\bgit\s+checkout\b/, reason: 'Switch branch or restore files' },
  { pattern: /\bgit\s+switch\b/, reason: 'Switch branch' },
  { pattern: /\bgit\s+stash\b/, reason: 'Stash changes' },
  { pattern: /\bgit\s+merge\b/, reason: 'Merge branches' },
  { pattern: /\bgit\s+rebase\b/, reason: 'Rebase branch' },
  { pattern: /\bgit\s+pull\b/, reason: 'Pull from remote' },
  { pattern: /\bgit\s+push\b(?!.*--force)(?!.*-f)(?!.*\+\s)/, reason: 'Push to remote' },
  { pattern: /\bgit\s+commit\b/, reason: 'Create commit' },
  { pattern: /\bgit\s+tag\b/, reason: 'Create tag' },
  { pattern: /\bgit\s+branch\b(?!.*-D)/, reason: 'Branch operations' },
  { pattern: /\bmkdir\b/, reason: 'Create directory' },
  { pattern: /\btouch\b/, reason: 'Create or update file timestamp' },
  { pattern: /\bcp\b/, reason: 'Copy files' },
  { pattern: /\bmv\b(?!.*\/\s*$)/, reason: 'Move/rename files' },
  { pattern: /\btee\b/, reason: 'Write to file and stdout' },
  { pattern: /\bcat\s*>/, reason: 'Write content to file' },
];

const SAFE_PATTERNS: Array<RegExp> = [
  /^\s*ls\b/,
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*grep\b/,
  /^\s*rg\b/,
  /^\s*find\b/,
  /^\s*wc\b/,
  /^\s*echo\b/,
  /^\s*pwd\b/,
  /^\s*which\b/,
  /^\s*whereis\b/,
  /^\s*file\b/,
  /^\s*stat\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*date\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
  /^\s*node\s+-v\b/,
  /^\s*node\s+--version\b/,
  /^\s*npm\s+--version\b/,
  /^\s*npm\s+list\b/,
  /^\s*npm\s+ls\b/,
  /^\s*npm\s+outdated\b/,
  /^\s*npm\s+audit\b/,
  /^\s*npm\s+info\b/,
  /^\s*python\s+--version\b/,
  /^\s*python3\s+--version\b/,
  /^\s*git\s+status\b/,
  /^\s*git\s+log\b/,
  /^\s*git\s+diff\b/,
  /^\s*git\s+show\b/,
  /^\s*git\s+branch\s*-?\w*\s*$/,  // branch without -D
  /^\s*git\s+rev-parse\b/,
  /^\s*git\s+remote\s*-v\b/,
  /^\s*git\s+config\s+--list\b/,
  /^\s*git\s+describe\b/,
  /^\s*git\s+stash\s+list\b/,
  /^\s*git\s+reflog\b/,
  /^\s*whoami\b/,
  /^\s*uname\b/,
  /^\s*uptime\b/,
];

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (ch === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function classifyCommand(command: string): SafetyResult {
  const trimmed = command.trim();

  if (!trimmed) {
    return { level: 'safe', reason: 'Empty command' };
  }

  // Check blocked patterns first
  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'blocked', reason };
    }
  }

  // Check dangerous patterns
  for (const { pattern, reason, suggestion } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'dangerous', reason, suggestion };
    }
  }

  // Check moderate patterns
  for (const { pattern, reason } of MODERATE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'moderate', reason };
    }
  }

  // Check safe patterns
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { level: 'safe', reason: 'Read-only or informational command' };
    }
  }

  // Parse the command to determine base command
  const tokens = tokenizeCommand(trimmed);

  // Handle pipes and chains - check the first command
  const pipeIndex = tokens.findIndex((t) => t === '|' || t === '||' || t === '&&' || t === ';');
  if (pipeIndex > 0) {
    const firstPart = tokens.slice(0, pipeIndex).join(' ');
    const firstResult = classifyCommand(firstPart);

    // If the whole pipeline contains dangerous commands, it's dangerous
    const rest = tokens.slice(pipeIndex + 1).join(' ');
    if (rest) {
      const restResult = classifyCommand(rest);
      if (restResult.level === 'blocked') return restResult;
      if (restResult.level === 'dangerous') return restResult;
    }

    return firstResult;
  }

  if (tokens.length === 0) {
    return { level: 'safe', reason: 'Empty command' };
  }

  // Extract flags from the command
  const flags = tokens.filter((t) => t.startsWith('-'));

  // Check for destructive flags on unknown commands
  if (flags.some((f) => f.includes('f') && !f.startsWith('--no'))) {
    if (tokens.some((t) => ['rm', 'mv', 'cp'].includes(t))) {
      return {
        level: 'dangerous',
        reason: 'Force flag on destructive command',
        suggestion: 'Force operations can be destructive.',
      };
    }
  }

  // Unknown commands are moderate by default
  return {
    level: 'moderate',
    reason: `Unknown command: ${tokens[0]}`,
    suggestion: 'Review the command before executing.',
  };
}
