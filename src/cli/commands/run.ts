import chalk from 'chalk';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../../config/loader.js';
import { SessionManager } from '../../sessions/manager.js';
import { getModel } from '../../models/registry.js';
import { resolveModelAlias } from '../../models/aliases.js';
import { createProvider } from '../../providers/index.js';
import { ToolRegistry } from '../../tools/registry.js';
import { ContextEngine } from '../../context/engine.js';
import { PermissionManager } from '../../permissions/manager.js';
import { AgentLoop } from '../../agent/loop.js';
import type { AgentConfig } from '../../agent/types.js';
import type { ProviderType } from '../../models/provider.js';

export interface RunOptions {
  projectPath: string;
  prompt?: string;
  model?: string;
  provider?: string;
  debug: boolean;
  permissions: boolean;
  compact: boolean;
  sessionId?: string;
}

export async function runCommand(opts: RunOptions): Promise<number> {
  const cwd = resolve(opts.projectPath);
  if (!existsSync(cwd)) {
    console.error(chalk.red(`Project path does not exist: ${cwd}`));
    return 1;
  }

  const config = loadConfig();
  const sessionManager = new SessionManager();

  const modelId = resolveModelAlias(opts.model ?? config.global.defaultModel ?? 'zen/deepseek-v4-flash-free');
  const modelInfo = getModel(modelId);
  if (!modelInfo) {
    console.error(chalk.red(`Unknown model: ${modelId}`));
    console.error(chalk.dim('Run `kiln models` to see available models.'));
    return 1;
  }

  const providerId = (opts.provider ?? modelInfo.provider) as ProviderType;
  const apiKey = config.credentials[providerId];
  if (!apiKey && providerId !== 'ollama') {
    console.error(chalk.red(`No API key configured for provider: ${providerId}`));
    console.error(chalk.dim(`Run \`kiln auth set ${providerId}\` to configure.`));
    return 1;
  }

  const agentConfig: AgentConfig = {
    model: modelId,
    provider: providerId,
    cwd,
    maxIterations: 20,
    maxRetries: config.global.maxRetries,
    debug: opts.debug,
  };

  const session = opts.sessionId
    ? await sessionManager.resumeSession(opts.sessionId)
    : await sessionManager.startNewSession(agentConfig);

  console.log(
    chalk.cyan(' kiln ') +
      chalk.dim(`${modelInfo.name} · ${providerId} · session ${session.metadata.id.slice(0, 8)}`),
  );
  console.log();

  if (opts.prompt) {
    const provider = createProvider(providerId, apiKey);
    const tools = new ToolRegistry();
    const context = new ContextEngine(cwd);
    const permissions = new PermissionManager({ autoApprove: !opts.permissions });

    const agent = new AgentLoop(provider, tools, context, permissions, agentConfig);
    await agent.initialize();

    process.stdout.write(chalk.white(opts.prompt) + '\n\n');

    let output = '';
    for await (const event of agent.chat(opts.prompt)) {
      switch (event.type) {
        case 'text':
          output += (event.data as { text: string }).text;
          process.stdout.write((event.data as { text: string }).text);
          break;
        case 'tool_call':
          process.stdout.write(
            chalk.cyan(`\n  → ${(event.data as { name: string }).name}`) + chalk.dim('()\n'),
          );
          break;
        case 'tool_result': {
          const data = event.data as { isError: boolean; name: string };
          if (data.isError) {
            process.stdout.write(chalk.red(`  ✗ ${data.name} failed\n`));
          }
          break;
        }
        case 'error':
          process.stdout.write(
            chalk.red(`\n  Error: ${(event.data as { message: string }).message}\n`),
          );
          break;
        case 'usage': {
          const usage = event.data as { input: number; output: number };
          if (opts.debug) {
            process.stdout.write(
              chalk.dim(`\n  tokens: ${usage.input} in / ${usage.output} out\n`),
            );
          }
          break;
        }
      }
    }

    session.messages.push(
      { role: 'user', content: opts.prompt },
      { role: 'assistant', content: output },
    );
    session.metadata.title = sessionManager.generateTitle(opts.prompt);
    await sessionManager.saveSession(session);

    console.log();
    return 0;
  }

  console.log(chalk.dim('Interactive mode not yet implemented. Use `kiln run <prompt>` for now.'));
  return 0;
}
