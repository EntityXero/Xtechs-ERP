/**
 * Permission system constants.
 * Deny-by-default model: users have no access unless explicitly granted.
 */

export const PERMISSION_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  EXPORT: 'export',
} as const;

export type PermissionAction =
  (typeof PERMISSION_ACTIONS)[keyof typeof PERMISSION_ACTIONS];

export const PERMISSION_ACTION_VALUES = Object.values(PERMISSION_ACTIONS);

export const PERMISSION_EFFECTS = {
  ALLOW: 'allow',
  DENY: 'deny',
} as const;

export type PermissionEffect =
  (typeof PERMISSION_EFFECTS)[keyof typeof PERMISSION_EFFECTS];

export const PERMISSION_EFFECT_VALUES = Object.values(PERMISSION_EFFECTS);

/**
 * Core ERP resource types that permissions can be assigned to.
 * Expand as modules are added.
 */
export const RESOURCE_TYPES = {
  TENANT: 'tenant',
  BUSINESS: 'business',
  BRANCH: 'branch',
  USER: 'user',
  ROLE: 'role',
  PERMISSION: 'permission',
  DOCUMENT: 'document',
  AUDIT_LOG: 'audit_log',
  METADATA: 'metadata',
  ACCOUNT: 'account',
  JOURNAL_ENTRY: 'journal_entry',
  FISCAL_YEAR: 'fiscal_year',
  CURRENCY: 'currency',
  ITEM: 'item',
  WAREHOUSE: 'warehouse',
  STOCK_LEDGER: 'stock_ledger',
  BATCH: 'batch',
} as const;

export type ResourceType =
  (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];
