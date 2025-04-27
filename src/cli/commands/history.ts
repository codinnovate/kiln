import { Command } from 'commander';
import chalk from 'chalk';
import { SessionManager } from '../../sessions/manager.js';

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'today ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export const historyCommand = new Command('history')
  .description('List past sessions')
  .option('-n, --limit <count>', 'Limit number of sessions shown', '20')
  .option('--json', 'Output as JSON')
  .action(async (opts) => {
    const manager = new SessionManager();
    const limit = parseInt(opts.limit, 10) || 20;

    const sessions = await manager.listSessions(limit);

    if (sessions.length === 0) {
      console.log(chalk.yellow('\n  No past sessions found.'));
      console.log(chalk.dim('  Start a session with `kiln` or `kiln run <prompt>`'));
      console.log();
      return;
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          sessions.map((s) => ({
            id: s.id,
            title: s.title,
            model: s.model,
            provider: s.provider,
            messageCount: s.messageCount,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            projectPath: s.projectPath,
            summary: s.summary,
          })),
          null,
          2,
        ),
      );
      return;
    }

    console.log(chalk.bold.cyan('\n  Session History\n'));

    const maxTitleLen = 40;
    const maxModelLen = 20;

    for (const session of sessions) {
      const id = chalk.dim(session.id.slice(0, 8));
      const title = chalk.bold(truncate(session.title, maxTitleLen));
      const model = chalk.dim(truncate(session.model, maxModelLen));
      const date = chalk.dim(formatDate(session.updatedAt));
      const msgs = chalk.dim(`${session.messageCount} msgs`);

      console.log(`  ${id}  ${title.padEnd(maxTitleLen + 4)} ${model.padEnd(maxModelLen + 4)} ${date.padEnd(12)} ${msgs}`);
    }

    console.log();
    console.log(chalk.dim('  Use `kiln resume <session-id>` to resume a session'));
    console.log();
  });

historyCommand
  .command('search <query>')
  .description('Search past sessions')
  .option('-n, --limit <count>', 'Limit results', '10')
  .action(async (query, opts) => {
    const manager = new SessionManager();
    const limit = parseInt(opts.limit, 10) || 10;

    const sessions = await manager.searchSessions(query);

    if (sessions.length === 0) {
      console.log(chalk.yellow(`\n  No sessions matching "${query}".`));
      return;
    }

    const limited = sessions.slice(0, limit);

    console.log(chalk.bold.cyan(`\n  Sessions matching "${query}"\n`));

    for (const session of limited) {
      const id = chalk.dim(session.id.slice(0, 8));
      const title = chalk.bold(truncate(session.title, 40));
      const model = chalk.dim(truncate(session.model, 20));
      const date = chalk.dim(formatDate(session.updatedAt));

      console.log(`  ${id}  ${title.padEnd(44)} ${model.padEnd(24)} ${date}`);
    }

    console.log();
  });
