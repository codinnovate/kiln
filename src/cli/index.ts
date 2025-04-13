#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runCommand } from './commands/run.js';
import { modelsCommand } from './commands/models.js';
import { configCommand, initCommand } from './commands/config.js';
import { doctorCommand } from './commands/doctor.js';
import { authCommand } from './commands/auth.js';
import { historyCommand } from './commands/history.js';
import { resumeCommand } from './commands/resume.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

const program = new Command();

program
  .name('kiln')
  .description('AI-powered coding assistant')
  .version(pkg.version)
  .argument('[project-path]', 'Project directory to work in')
  .option('-m, --model <model>', 'Specify model (e.g., "openai/gpt-4o", "claude-sonnet")')
  .option('-p, --provider <provider>', 'Specify provider')
  .option('--debug', 'Enable debug mode')
  .option('--no-permissions', 'Disable permission prompts (auto-approve all)')
  .option('--compact', 'Enable auto-compaction')
  .option('-s, --session <id>', 'Resume specific session')
  .action(async (projectPath, opts) => {
    try {
      await runCommand({
        projectPath: projectPath ?? process.cwd(),
        model: opts.model,
        provider: opts.provider,
        debug: opts.debug ?? false,
        permissions: opts.permissions ?? true,
        compact: opts.compact ?? false,
        sessionId: opts.session,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize project configuration')
  .action(async () => {
    try {
      await initCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('run <prompt>')
  .description('Run a single prompt non-interactively')
  .option('-m, --model <model>', 'Specify model')
  .option('-p, --provider <provider>', 'Specify provider')
  .option('--no-permissions', 'Disable permission prompts')
  .action(async (prompt, opts) => {
    try {
      const exitCode = await runCommand({
        projectPath: process.cwd(),
        prompt,
        model: opts.model,
        provider: opts.provider,
        debug: false,
        permissions: opts.permissions ?? true,
        compact: false,
      });
      process.exit(exitCode);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.addCommand(modelsCommand);
program.addCommand(configCommand);
program.addCommand(doctorCommand);
program.addCommand(authCommand);
program.addCommand(historyCommand);
program.addCommand(resumeCommand);

program.parse();
