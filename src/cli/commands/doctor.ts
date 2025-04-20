import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { existsSync, accessSync, constants, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir, platform, release } from 'node:os';
import { hasCredential } from '../../config/credentials.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.slice(1), 10);
  if (major >= 18) {
    return {
      name: 'Node.js version',
      status: 'pass',
      message: `${version}`,
    };
  }
  return {
    name: 'Node.js version',
    status: 'fail',
    message: `${version} (requires >= 18)`,
  };
}

function checkPlatform(): CheckResult {
  return {
    name: 'Platform',
    status: 'pass',
    message: `${platform()} ${release()}`,
  };
}

function checkGit(): CheckResult {
  try {
    const version = execSync('git --version', { encoding: 'utf-8' }).trim();
    return {
      name: 'Git',
      status: 'pass',
      message: version,
    };
  } catch {
    return {
      name: 'Git',
      status: 'warn',
      message: 'Not found (optional)',
    };
  }
}

function checkConfigDir(): CheckResult {
  const configDir = resolve(homedir(), '.kiln');
  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    accessSync(configDir, constants.R_OK | constants.W_OK);
    return {
      name: 'Config directory',
      status: 'pass',
      message: configDir,
    };
  } catch {
    return {
      name: 'Config directory',
      status: 'fail',
      message: `Cannot access ${configDir}`,
    };
  }
}

function checkConfigFile(): CheckResult {
  const configPath = resolve(homedir(), '.kiln', 'config.json');
  if (existsSync(configPath)) {
    return {
      name: 'Config file',
      status: 'pass',
      message: 'Found',
    };
  }
  return {
    name: 'Config file',
    status: 'warn',
    message: 'Not found (run `kiln init` to create)',
  };
}

function checkCredentialsFile(): CheckResult {
  const credPath = resolve(homedir(), '.kiln', 'credentials.json');
  if (existsSync(credPath)) {
    return {
      name: 'Credentials file',
      status: 'pass',
      message: 'Found',
    };
  }
  return {
    name: 'Credentials file',
    status: 'warn',
    message: 'Not found (run `kiln auth set <provider>` to create)',
  };
}

function checkApiKeys(): CheckResult[] {
  const providers = ['openai', 'anthropic', 'google', 'openrouter'];
  const results: CheckResult[] = [];

  for (const provider of providers) {
    const envKey = resolveEnvKey(provider);
    const hasKilnKey = hasCredential(provider);

    if (hasKilnKey || envKey) {
      results.push({
        name: `${provider} API key`,
        status: 'pass',
        message: hasKilnKey ? 'Configured (kiln)' : 'Configured (env)',
      });
    } else {
      results.push({
        name: `${provider} API key`,
        status: 'warn',
        message: 'Not configured',
      });
    }
  }

  return results;
}

function resolveEnvKey(provider: string): string | undefined {
  const envMap: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  return envMap[provider];
}

function checkAgentsMd(): CheckResult {
  const agentsPath = resolve(process.cwd(), 'AGENTS.md');
  if (existsSync(agentsPath)) {
    return {
      name: 'AGENTS.md',
      status: 'pass',
      message: 'Found in current directory',
    };
  }
  return {
    name: 'AGENTS.md',
    status: 'warn',
    message: 'Not found (optional)',
  };
}

function displayResults(results: CheckResult[]): void {
  console.log(chalk.bold.cyan('\n  kiln doctor\n'));

  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const result of results) {
    const icon =
      result.status === 'pass'
        ? chalk.green('✓')
        : result.status === 'fail'
          ? chalk.red('✗')
          : chalk.yellow('⚠');

    const name = result.status === 'fail' ? chalk.red(result.name) : result.name;
    const message =
      result.status === 'pass'
        ? chalk.dim(result.message)
        : result.status === 'fail'
          ? chalk.red(result.message)
          : chalk.yellow(result.message);

    console.log(`  ${icon}  ${name.padEnd(25)} ${message}`);

    if (result.status === 'pass') passed++;
    else if (result.status === 'fail') failed++;
    else warned++;
  }

  console.log();
  const summary = [
    chalk.green(`${passed} passed`),
    warned > 0 ? chalk.yellow(`${warned} warnings`) : null,
    failed > 0 ? chalk.red(`${failed} failed`) : null,
  ]
    .filter(Boolean)
    .join(', ');

  console.log(`  ${summary}`);
  console.log();

  if (failed > 0) {
    console.log(chalk.red('  Some checks failed. Please fix the issues above.'));
  } else if (warned > 0) {
    console.log(chalk.yellow('  Some warnings detected. These are optional but recommended.'));
  } else {
    console.log(chalk.green.bold('  Everything looks good!'));
  }
  console.log();
}

export const doctorCommand = new Command('doctor')
  .description('Check system health')
  .action(() => {
    const results: CheckResult[] = [
      checkNodeVersion(),
      checkPlatform(),
      checkGit(),
      checkConfigDir(),
      checkConfigFile(),
      checkCredentialsFile(),
      ...checkApiKeys(),
      checkAgentsMd(),
    ];

    displayResults(results);
  });
