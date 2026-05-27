import type { TenantScope } from './tenant.js';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'archived';
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Authenticated user context attached to every request.
 * Includes tenant scope and resolved permissions.
 */
export interface AuthContext {
  userId: string;
  email: string;
  scope: TenantScope;
  roles: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  businessId: string;
  branchId: string;
  roles: string[];
  iat: number;
  exp: number;
}
