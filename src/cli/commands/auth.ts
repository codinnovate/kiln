import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import {
  listCredentials,
  hasCredential,
  setCredential,
  removeCredential,
} from '../../config/credentials.js';
import { createProvider } from '../../providers/index.js';
import type { ProviderType } from '../../models/provider.js';

const VALID_PROVIDERS: ProviderType[] = ['openai', 'anthropic', 'google', 'openrouter', 'ollama'];

function promptForSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write(question);
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');

    let input = '';

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\n' || char === '\r') {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          rl.close();
          process.stdout.write('\n');
          resolve(input);
          return;
        } else if (char === '\u007F' || char === '\b') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (char === '\u0003') {
          process.stdin.setRawMode?.(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          rl.close();
          process.stdout.write('\n');
          resolve('');
          return;
        } else {
          input += char;
          process.stdout.write('*');
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

function showProviderStatus(): void {
  const providers: { name: ProviderType; envKey?: string }[] = [
    { name: 'openai', envKey: process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : undefined },
    { name: 'anthropic', envKey: process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : undefined },
    { name: 'google', envKey: process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : undefined },
    { name: 'openrouter', envKey: process.env.OPENROUTER_API_KEY ? 'OPENROUTER_API_KEY' : undefined },
    { name: 'ollama' },
  ];

  console.log(chalk.bold.cyan('\n  API Key Status\n'));

  for (const provider of providers) {
    const kilnKey = hasCredential(provider.name);
    const icon = kilnKey ? chalk.green('✓') : provider.envKey ? chalk.yellow('○') : chalk.red('✗');

    let status: string;
    if (kilnKey) {
      status = chalk.green('Configured (kiln)');
    } else if (provider.envKey) {
      status = chalk.yellow(`Via env: ${provider.envKey}`);
    } else {
      status = chalk.red('Not configured');
    }

    console.log(`  ${icon}  ${provider.name.padEnd(15)} ${status}`);
  }

  console.log();
  console.log(chalk.dim('  Run `kiln auth set <provider>` to add a key'));
  console.log(chalk.dim('  Run `kiln auth test <provider>` to verify a key'));
  console.log();
}

export const authCommand = new Command('auth')
  .description('Manage API keys')
  .action(() => {
    showProviderStatus();
  });

authCommand
  .command('set <provider>')
  .description('Set API key for a provider')
  .action(async (provider) => {
    if (!VALID_PROVIDERS.includes(provider as ProviderType)) {
      console.error(chalk.red(`Invalid provider: ${provider}`));
      console.error(chalk.dim(`Valid providers: ${VALID_PROVIDERS.join(', ')}`));
      process.exit(1);
    }

    if (provider === 'ollama') {
      console.log(chalk.yellow('  Ollama runs locally and does not require an API key.'));
      console.log(chalk.dim('  Make sure Ollama is running: ollama serve'));
      return;
    }

    const envVarMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      google: 'GOOGLE_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
    };

    console.log(chalk.bold(`\n  Set API key for ${provider}\n`));
    console.log(chalk.dim(`  You can also set the ${envVarMap[provider]} environment variable.`));
    console.log();

    const key = await promptForSecret(`  Enter API key for ${provider}: `);

    if (!key) {
      console.log(chalk.yellow('\n  No key entered. Aborting.'));
      return;
    }

    setCredential(provider, key);
    console.log(chalk.green(`\n  ✓ API key for ${provider} saved.`));
    console.log(chalk.dim(`  Stored in ~/.kiln/credentials.json`));
    console.log();
  });

authCommand
  .command('remove <provider>')
  .description('Remove stored API key')
  .action((provider) => {
    if (!VALID_PROVIDERS.includes(provider as ProviderType)) {
      console.error(chalk.red(`Invalid provider: ${provider}`));
      process.exit(1);
    }

    const removed = removeCredential(provider);
    if (removed) {
      console.log(chalk.green(`  ✓ Removed API key for ${provider}.`));
    } else {
      console.log(chalk.yellow(`  No API key found for ${provider}.`));
    }
  });

authCommand
  .command('test <provider>')
  .description('Test if API key works')
  .action(async (provider) => {
    if (!VALID_PROVIDERS.includes(provider as ProviderType)) {
      console.error(chalk.red(`Invalid provider: ${provider}`));
      process.exit(1);
    }

    if (provider === 'ollama') {
      console.log(chalk.yellow('  Ollama runs locally. Checking connection...'));
      try {
        const { default: fetch } = await import('node-fetch');
        const res = await fetch('http://localhost:11434/api/tags');
        if (res.ok) {
          console.log(chalk.green('  ✓ Ollama is running and accessible.'));
        } else {
          console.log(chalk.red(`  ✗ Ollama responded with status ${res.status}`));
        }
      } catch {
        console.log(chalk.red('  ✗ Cannot connect to Ollama. Is it running?'));
        console.log(chalk.dim('  Start it with: ollama serve'));
      }
      return;
    }

    const key = listCredentials().includes(provider)
      ? (await import('../../config/loader.js')).loadConfig().credentials[provider]
      : process.env[`${provider.toUpperCase()}_API_KEY`];

    if (!key) {
      console.log(chalk.red(`  No API key found for ${provider}.`));
      console.log(chalk.dim(`  Run \`kiln auth set ${provider}\` to add one.`));
      return;
    }

    console.log(chalk.dim(`  Testing API key for ${provider}...`));

    try {
      const providerInstance = createProvider(provider as ProviderType, key);
      const valid = providerInstance.validate();

      if (valid) {
        console.log(chalk.green(`  ✓ API key for ${provider} appears valid.`));
      } else {
        console.log(chalk.red(`  ✗ API key for ${provider} appears invalid.`));
      }
    } catch (error) {
      console.log(chalk.red(`  ✗ Error testing key: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
