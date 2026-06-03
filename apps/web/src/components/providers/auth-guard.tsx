'use client';

/**
 * Auth guard — wraps all authenticated workspace routes.
 * On mount, verifies the HttpOnly cookie session via /api/v1/auth/me.
 * Redirects to /login if the session is invalid or expired.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const { isAuthenticated, user, isLoading, checkSession } = useAuthStore();
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    // Re-verify session with the server on every workspace mount.
    // This catches expired cookies even if Zustand state says isAuthenticated.
    checkSession().finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (checked && !isLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else if (user?.forcePasswordChange) {
        router.replace('/auth/change-password');
      }
    }
  }, [checked, isLoading, isAuthenticated, user, router]);

  // Show spinner while verifying session
  if (!checked || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 select-none">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-mono">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Not authenticated → router.replace('/login') is in flight
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
