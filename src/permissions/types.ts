import type { CommandSafety } from '../shell/safety.js';

export type PermissionAction = 'allow' | 'allow_always' | 'deny';

export interface PermissionRequest {
  type: 'command' | 'file_write' | 'file_delete';
  target: string;
  description: string;
  safety: CommandSafety;
}

export interface PermissionDecision {
  action: PermissionAction;
  rememberKey?: string;
}

export interface PermissionChecker {
  check(request: PermissionRequest): Promise<PermissionDecision>;
  isAlwaysAllowed(request: PermissionRequest): boolean;
}

export interface StoredPermission {
  pattern: string;
  type: PermissionRequest['type'];
  addedAt: string;
  description?: string;
}
