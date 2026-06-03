/**
 * Auth store — stores user session metadata only.
 * The actual auth token lives in an HttpOnly cookie managed by the browser.
 * We call /api/v1/auth/me on mount to verify the session and populate user info.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, ApiError } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: string | null;
  forcePasswordChange: boolean;
}

export interface AuthScope {
  tenantId: string;
  businessId: string;
  branchId: string;
}

export interface ResolvedPermission {
  resource: string;
  action: string;
  effect: 'allow' | 'deny';
}

interface LoginResponse {
  user: AuthUser;
  scope: AuthScope;
  tokenScope: string;
  roles: string[];
  permissions: ResolvedPermission[];
}

interface MeResponse {
  user: AuthUser;
  scope: AuthScope;
  tokenScope: string;
  roles: string[];
  permissions: ResolvedPermission[];
}

interface BranchOption {
  id: string;
  name: string;
}

interface LoginNeedsBranchResponse {
  error: 'BRANCH_SELECTION_REQUIRED';
  branches: BranchOption[];
}

// ─── State ────────────────────────────────────────────────────

interface AuthState {
  // Session data
  user: AuthUser | null;
  scope: AuthScope | null;
  roles: string[];
  tokenScope: string | null;
  permissions: ResolvedPermission[];

  // UI state
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (
    email: string,
    password: string,
    branchId?: string,
  ) => Promise<{ needsBranchSelection: false } | { needsBranchSelection: true; branches: BranchOption[] }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearError: () => void;
}

// ─── Store ────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      user: null,
      scope: null,
      roles: [],
      tokenScope: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password, branchId) => {
        set({ isLoading: true, error: null });
        try {
          const body: Record<string, string> = { email, password };
          if (branchId) body['branchId'] = branchId;

          const data = await api.post<LoginResponse | LoginNeedsBranchResponse>(
            '/api/v1/auth/login',
            body,
          );

          // Check if backend requires branch selection
          if ('error' in data && data.error === 'BRANCH_SELECTION_REQUIRED') {
            set({ isLoading: false });
            return { needsBranchSelection: true, branches: data.branches };
          }

          const res = data as LoginResponse;
          set({
            user: res.user,
            scope: res.scope,
            roles: res.roles,
            tokenScope: res.tokenScope,
            permissions: res.permissions || [],
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return { needsBranchSelection: false };
        } catch (err) {
          const message = err instanceof ApiError ? err.message : 'Login failed';
          set({ isLoading: false, error: message, isAuthenticated: false });
          throw err;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await api.post('/api/v1/auth/logout');
        } catch {
          // Always clear local state even if API call fails
        } finally {
          set({
            user: null,
            scope: null,
            roles: [],
            tokenScope: null,
            permissions: [],
            isAuthenticated: false,
            isLoading: false,
            error: null,
          });
        }
      },

      checkSession: async () => {
        set({ isLoading: true });
        try {
          const data = await api.get<MeResponse>('/api/v1/auth/me');
          set({
            user: data.user,
            scope: data.scope,
            roles: data.roles,
            tokenScope: data.tokenScope,
            permissions: data.permissions || [],
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Cookie is invalid/expired — clear state
          set({
            user: null,
            scope: null,
            roles: [],
            tokenScope: null,
            permissions: [],
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'xtechs-auth',
      // Only persist non-sensitive display data — NOT the token (stays in HttpOnly cookie)
      partialize: (state) => ({
        user: state.user,
        scope: state.scope,
        roles: state.roles,
        tokenScope: state.tokenScope,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
