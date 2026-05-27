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
 * Scope type for JWT tokens.
 * - 'branch': Token is scoped to a single branch (default)
 * - 'all-branches': Token grants access to all branches in the business
 *   (only for admins or users with the 'all_branches_access' permission)
 */
export type TokenScope = 'branch' | 'all-branches';

/**
 * Authenticated user context attached to every request.
 * Includes tenant scope and resolved permissions.
 */
export interface AuthContext {
  userId: string;
  email: string;
  scope: TenantScope;
  tokenScope: TokenScope;
  roles: string[];
}

export interface LoginPayload {
  email: string;
  password: string;
  branchId?: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  tenantId: string;
  businessId: string;
  branchId: string;
  tokenScope: TokenScope;
  roles: string[];
  iat: number;
  exp: number;
}

/** Safe user response (no password hash) */
export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  tokens: AuthTokens;
  user: UserResponse;
}
