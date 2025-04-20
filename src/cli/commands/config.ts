import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadGlobalConfig, getConfigDir } from '../../config/loader.js';
import { GlobalConfigSchema } from '../../config/schema.js';

function getConfigPath(): string {
  return resolve(getConfigDir(), 'config.json');
}

function ensureConfigDir(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function displayConfig(config: ReturnType<typeof loadGlobalConfig>): void {
  console.log(chalk.bold.cyan('\n  Configuration\n'));

  console.log(chalk.bold('  General'));
  console.log(`    Default provider:  ${config.defaultProvider ? chalk.green(config.defaultProvider) : chalk.dim('not set')}`);
  console.log(`    Default model:     ${config.defaultModel ? chalk.green(config.defaultModel) : chalk.dim('not set')}`);
  console.log(`    Theme:             ${config.theme}`);
  console.log(`    Debug:             ${config.debug}`);
  console.log();

  const providers = Object.entries(config.providers);
  if (providers.length > 0) {
    console.log(chalk.bold('  Providers'));
    for (const [name, provider] of providers) {
      console.log(`    ${chalk.bold(name)}`);
      console.log(`      Type:           ${provider.type}`);
      if (provider.baseUrl) {
        console.log(`      Base URL:       ${provider.baseUrl}`);
      }
      if (provider.defaultModel) {
        console.log(`      Default model:  ${provider.defaultModel}`);
      }
      if (provider.models.length > 0) {
        console.log(`      Models:         ${provider.models.join(', ')}`);
      }
    }
    console.log();
  } else {
    console.log(chalk.dim('  No providers configured.'));
    console.log(chalk.dim('  Use `kiln auth set <provider>` to add an API key.'));
    console.log();
  }
}

export const configCommand = new Command('config')
  .description('Show/edit configuration')
  .action(() => {
    const config = loadGlobalConfig();
    displayConfig(config);
  });

configCommand
  .command('get <key>')
  .description('Get a config value')
  .action((key) => {
    const config = loadGlobalConfig();
    const keys = key.split('.');
    let value: unknown = config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        value = undefined;
        break;
      }
    }

    if (value === undefined) {
      console.log(chalk.dim(`Config key "${key}" is not set.`));
      process.exit(1);
    }

    console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  });

configCommand
  .command('set <key> <value>')
  .description('Set a config value')
  .action((key, value) => {
    ensureConfigDir();
    const configPath = getConfigPath();

    let config: ReturnType<typeof loadGlobalConfig>;
    try {
      const raw = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf-8'))
        : {};
      config = GlobalConfigSchema.parse(raw);
    } catch {
      config = GlobalConfigSchema.parse({});
    }

    const keys = key.split('.');
    let target: Record<string, unknown> = config as unknown as Record<string, unknown>;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!(k in target) || typeof target[k] !== 'object' || target[k] === null) {
        target[k] = {};
      }
      target = target[k] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1]!;

    if (value === 'true') {
      target[lastKey] = true;
    } else if (value === 'false') {
      target[lastKey] = false;
    } else if (value === 'null') {
      target[lastKey] = null;
    } else if (!isNaN(Number(value)) && value !== '') {
      target[lastKey] = Number(value);
    } else {
      target[lastKey] = value;
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(chalk.green(`  Set ${chalk.bold(key)} = ${chalk.bold(String(target[lastKey]))}`));
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .action(() => {
    ensureConfigDir();
    const configPath = getConfigPath();
    const defaultConfig = GlobalConfigSchema.parse({});
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log(chalk.green('  Configuration reset to defaults.'));
  });

export async function initCommand(): Promise<void> {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    console.log(chalk.yellow(`  Configuration already exists at ${configPath}`));
    console.log(chalk.dim('  Use `kiln config` to view or `kiln config reset` to reset.'));
    return;
  }

  ensureConfigDir();
  const defaultConfig = GlobalConfigSchema.parse({});
  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');

  const projectDir = resolve(process.cwd(), '.kiln');
  if (!existsSync(projectDir)) {
    mkdirSync(projectDir, { recursive: true });
  }

  console.log(chalk.green.bold('\n  Initialized kiln configuration\n'));
  console.log(`  Global config: ${chalk.dim(configPath)}`);
  console.log(`  Project dir:   ${chalk.dim(projectDir)}`);
  console.log();
  console.log(chalk.dim('  Next steps:'));
  console.log(chalk.dim('    1. Run `kiln auth set <provider>` to add an API key'));
  console.log(chalk.dim('    2. Run `kiln models` to see available models'));
  console.log(chalk.dim('    3. Run `kiln doctor` to check your setup'));
  console.log();
}
