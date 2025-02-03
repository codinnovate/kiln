import { ToolRegistry } from './registry.js';
import { filesystemTools } from './filesystem.js';
import { shellTools } from './shell.js';
import { gitTools } from './git.js';

export { ToolRegistry } from './registry.js';
export type { ToolHandler, ToolContext, PermissionChecker } from './registry.js';
export { filesystemTools } from './filesystem.js';
export { shellTools } from './shell.js';
export { gitTools } from './git.js';

export function createDefaultTools(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of filesystemTools) {
    registry.register(tool);
  }
  for (const tool of shellTools) {
    registry.register(tool);
  }
  for (const tool of gitTools) {
    registry.register(tool);
  }
  return registry;
}
