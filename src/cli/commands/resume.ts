import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { loadConfig } from '../../config/loader.js';
import { SessionManager } from '../../sessions/manager.js';
import { getModel } from '../../models/registry.js';
import { createProvider } from '../../providers/index.js';
import { ToolRegistry } from '../../tools/registry.js';
import { ContextEngine } from '../../context/engine.js';
import { PermissionManager } from '../../permissions/manager.js';
import { AgentLoop } from '../../agent/loop.js';
import type { AgentConfig } from '../../agent/types.js';
import type { ProviderType } from '../../models/provider.js';

export const resumeCommand = new Command('resume')
  .description('Resume a past session')
  .argument('<id>', 'Session ID (or prefix)')
  .option('--no-permissions', 'Disable permission prompts')
  .action(async (id, opts) => {
    try {
      const config = loadConfig();
      const sessionManager = new SessionManager();
      const sessions = await sessionManager.listSessions(100);

      const match = sessions.find((s) => s.id === id || s.id.startsWith(id));
      if (!match) {
        console.error(chalk.red(`Session not found: ${id}`));
        console.error(chalk.dim('Run `kiln history` to see available sessions.'));
        process.exit(1);
      }

      const session = await sessionManager.resumeSession(match.id);
      const modelInfo = getModel(session.metadata.model);
      if (!modelInfo) {
        console.error(chalk.red(`Unknown model: ${session.metadata.model}`));
        process.exit(1);
      }

      const providerId = (session.metadata.provider ?? modelInfo.provider) as ProviderType;
      const apiKey = config.credentials[providerId];
      if (!apiKey && providerId !== 'ollama' && providerId !== 'zen') {
        console.error(chalk.red(`No API key configured for provider: ${providerId}`));
        process.exit(1);
      }

      const cwd = resolve(session.metadata.projectPath || process.cwd());
      const agentConfig: AgentConfig = {
        model: session.metadata.model,
        provider: providerId,
        cwd,
        maxIterations: 20,
        maxRetries: config.global.maxRetries,
      };

      console.log(
        chalk.cyan(' kiln ') +
          chalk.dim(`Resumed ${chalk.bold(match.title)} · ${modelInfo.name} · ${providerId}`),
      );
      console.log(chalk.dim(`  Session ${match.id.slice(0, 8)} · ${match.messageCount} prior messages`));
      console.log();

      const provider = createProvider(providerId, apiKey);
      const tools = new ToolRegistry();
      const context = new ContextEngine(cwd);
      const permissions = new PermissionManager({ autoApprove: !opts.permissions });

      const agent = new AgentLoop(provider, tools, context, permissions, agentConfig);
      await agent.initialize();

      // Replay prior messages into the agent
      for (const msg of session.messages) {
        agent.getState().messages.push(msg);
      }

      // Prompt for new input
      const readline = await import('node:readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const promptUser = (): Promise<string> =>
        new Promise((resolve) => rl.question(chalk.cyan('> '), resolve));

      let input = await promptUser();
      while (input.trim()) {
        process.stdout.write('\n');

        let output = '';
        for await (const event of agent.chat(input)) {
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
          }
        }

        session.messages.push(
          { role: 'user', content: input },
          { role: 'assistant', content: output },
        );
        await sessionManager.saveSession(session);

        console.log();
        input = await promptUser();
      }

      rl.close();
      console.log(chalk.dim('\nSession saved.'));
      process.exit(0);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
