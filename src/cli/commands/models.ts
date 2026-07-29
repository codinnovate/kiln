import { Command } from 'commander';
import chalk from 'chalk';
import { listModels } from '../../models/registry.js';
import type { ModelInfo, ProviderType } from '../../models/provider.js';
import { hasCredential } from '../../config/credentials.js';

type ChalkFn = (text: string) => string;

function formatCost(cost: number): string {
  if (cost === 0) return chalk.green('free');
  const perMillion = cost * 1_000_000;
  if (perMillion < 1) return chalk.yellow(`$${perMillion.toFixed(2)}/M`);
  return chalk.yellow(`$${perMillion.toFixed(2)}/M`);
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function providerIcon(provider: ProviderType): string {
  const icons: Record<ProviderType, string> = {
    openai: '●',
    anthropic: '●',
    google: '●',
    openrouter: '●',
    ollama: '●',
    custom: '○',
    zen: '★',
  };
  return icons[provider] ?? '○';
}

function providerColor(provider: ProviderType): ChalkFn {
  const colors: Record<ProviderType, ChalkFn> = {
    openai: chalk.green,
    anthropic: chalk.yellow,
    google: chalk.blue,
    openrouter: chalk.magenta,
    ollama: chalk.gray,
    custom: chalk.white,
    zen: chalk.cyan,
  };
  return colors[provider] ?? chalk.white;
}

function modelRow(model: ModelInfo, showProvider: boolean): string {
  const parts: string[] = [];

  if (showProvider) {
    const color = providerColor(model.provider);
    parts.push(color(`${providerIcon(model.provider)} ${model.provider.padEnd(10)}`));
  }

  parts.push(chalk.bold(model.name.padEnd(20)));
  parts.push(chalk.dim(`ctx ${formatNumber(model.contextWindow)}`.padEnd(12)));
  parts.push(chalk.dim(`out ${formatNumber(model.maxOutput)}`.padEnd(10)));

  const caps: string[] = [];
  if (model.supportsTools) caps.push(chalk.green('tools'));
  if (model.supportsStreaming) caps.push(chalk.blue('stream'));
  if (model.supportsReasoning) caps.push(chalk.magenta('reason'));
  parts.push(caps.join(' '));

  parts.push(`  in:${formatCost(model.costPerInputToken)}  out:${formatCost(model.costPerOutputToken)}`);

  const hasKey = hasCredential(model.provider);
  if (hasKey) {
    parts.push(chalk.green(' ✓'));
  }

  return parts.join('  ');
}

export const modelsCommand = new Command('models')
  .description('List available models')
  .option('--json', 'Output as JSON')
  .option('--provider <provider>', 'Filter by provider')
  .action((opts) => {
    const allModels = listModels();

    const filtered = opts.provider
      ? allModels.filter((m) => m.provider === opts.provider)
      : allModels;

    if (filtered.length === 0) {
      console.log(chalk.yellow('No models found.'));
      if (opts.provider) {
        console.log(chalk.dim(`No models for provider: ${opts.provider}`));
      }
      return;
    }

    if (opts.json) {
      const json = filtered.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        contextWindow: m.contextWindow,
        maxOutput: m.maxOutput,
        supportsTools: m.supportsTools,
        supportsStreaming: m.supportsStreaming,
        supportsReasoning: m.supportsReasoning,
        costPerInputToken: m.costPerInputToken,
        costPerOutputToken: m.costPerOutputToken,
        hasApiKey: hasCredential(m.provider),
      }));
      console.log(JSON.stringify(json, null, 2));
      return;
    }

    const providers = new Map<ProviderType, ModelInfo[]>();
    for (const model of filtered) {
      const list = providers.get(model.provider) ?? [];
      list.push(model);
      providers.set(model.provider, list);
    }

    console.log(chalk.bold.cyan('\n  Available Models\n'));

    for (const [provider, models] of providers) {
      const color = providerColor(provider);
      console.log(chalk.bold(color(`  ${provider.toUpperCase()}`)));
      console.log();

      for (const model of models) {
        console.log(`    ${modelRow(model, false)}`);
      }
      console.log();
    }

    console.log(chalk.dim('  ✓ = API key configured'));
    console.log(chalk.dim('  Use `kiln auth set <provider>` to add a key'));
    console.log();
  });
