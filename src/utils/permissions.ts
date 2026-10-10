import { UserRole } from '../types/index.js';

export type PermissionAction =
  | 'workspace:delete'
  | 'workspace:manage_settings'
  | 'workspace:manage_members'
  | 'provider:manage'
  | 'customer:create'
  | 'customer:edit'
  | 'customer:delete'
  | 'recovery:trigger_retry'
  | 'recovery:send_message'
  | 'recovery:edit_campaigns'
  | 'data:import_csv'
  | 'audit:view';

export const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  owner: [
    'workspace:delete',
    'workspace:manage_settings',
    'workspace:manage_members',
    'provider:manage',
    'customer:create',
    'customer:edit',
    'customer:delete',
    'recovery:trigger_retry',
    'recovery:send_message',
    'recovery:edit_campaigns',
    'data:import_csv',
    'audit:view',
  ],
  admin: [
    'workspace:manage_settings',
    'workspace:manage_members',
    'provider:manage',
    'customer:create',
    'customer:edit',
    'recovery:trigger_retry',
    'recovery:send_message',
    'recovery:edit_campaigns',
    'data:import_csv',
    'audit:view',
  ],
  operator: [
    'customer:create',
    'customer:edit',
    'recovery:trigger_retry',
    'recovery:send_message',
    'data:import_csv',
    'audit:view',
  ],
  member: [
    'customer:create',
    'customer:edit',
    'recovery:send_message',
    'data:import_csv',
    'audit:view',
  ],
  viewer: [
    'audit:view',
  ],
};

export function hasPermission(role: UserRole | string, action: PermissionAction): boolean {
  const normalizedRole = (role || 'viewer') as UserRole;
  const perms = ROLE_PERMISSIONS[normalizedRole] || ROLE_PERMISSIONS.viewer;
  return perms.includes(action);
}

export function getRoleBadgeInfo(role: UserRole): {
  label: string;
  description: string;
  badgeClass: string;
} {
  switch (role) {
    case 'owner':
      return {
        label: 'Owner',
        description: 'Full administrative access, member management, and workspace destruction.',
        badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
      };
    case 'admin':
      return {
        label: 'Admin',
        description: 'Manage recovery operations, payment gateways, and campaigns.',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      };
    case 'operator':
      return {
        label: 'Operator',
        description: 'Trigger retries, dispatch recovery communication, and manage customer records.',
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      };
    case 'member':
      return {
        label: 'Member',
        description: 'Team member with customer management permissions.',
        badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      };
    case 'viewer':
      return {
        label: 'Viewer',
        description: 'Read-only access across metrics, opportunities, and audit logs.',
        badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      };
  }
}
