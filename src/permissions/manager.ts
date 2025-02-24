import type {
  PermissionChecker,
  PermissionRequest,
  PermissionDecision,
} from './types.js';
import { PermissionStore } from './store.js';

export interface PermissionManagerOptions {
  storePath?: string;
  autoApprove?: boolean;
  onPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
}

export class PermissionManager implements PermissionChecker {
  private store: PermissionStore;
  private autoApprove: boolean;
  private onPrompt?: (request: PermissionRequest) => Promise<PermissionDecision>;
  private sessionAllowed: Set<string> = new Set();

  constructor(options: PermissionManagerOptions = {}) {
    this.store = new PermissionStore(options.storePath);
    this.autoApprove = options.autoApprove ?? false;
    this.onPrompt = options.onPrompt;
  }

  isAlwaysAllowed(request: PermissionRequest): boolean {
    return this.store.isAllowed(request);
  }

  async check(request: PermissionRequest): Promise<PermissionDecision> {
    if (request.safety === 'blocked') {
      return { action: 'deny' };
    }

    if (request.safety === 'safe') {
      return { action: 'allow' };
    }

    const exactKey = this.store.makeKey(request);
    if (this.sessionAllowed.has(exactKey)) {
      return { action: 'allow' };
    }

    if (this.store.isAllowed(request)) {
      return { action: 'allow' };
    }

    if (this.autoApprove) {
      return { action: 'allow' };
    }

    if (this.onPrompt) {
      const decision = await this.onPrompt(request);
      this.applyDecision(request, decision);
      return decision;
    }

    return { action: 'deny' };
  }

  allowSession(request: PermissionRequest): void {
    this.sessionAllowed.add(this.store.makeKey(request));
  }

  allowAlways(request: PermissionRequest): void {
    const key = this.store.makeKey(request);
    this.store.addPermission(key, request.target, request.type, request.description);
    this.sessionAllowed.add(key);
  }

  allowWildcard(command: string): void {
    const firstWord = command.trim().split(/\s+/)[0];
    const pattern = `${firstWord} *`;
    const key = `command:${pattern}`;
    this.store.addPermission(key, pattern, 'command', `Allow all ${firstWord} commands`);
  }

  denyPermission(key: string): void {
    this.store.removePermission(key);
    this.sessionAllowed.delete(key);
  }

  private applyDecision(request: PermissionRequest, decision: PermissionDecision): void {
    if (decision.action === 'allow_always') {
      const key = decision.rememberKey ?? this.store.makeKey(request);
      this.store.addPermission(key, request.target, request.type, request.description);
      this.sessionAllowed.add(key);
    } else if (decision.action === 'allow') {
      this.sessionAllowed.add(this.store.makeKey(request));
    }
  }

  getStore(): PermissionStore {
    return this.store;
  }

  resetSession(): void {
    this.sessionAllowed.clear();
  }
}
