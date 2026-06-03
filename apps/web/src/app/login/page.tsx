'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Eye, EyeOff, Loader2, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface BranchOption {
  id: string;
  name: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);

  // Branch selection state — shown when user has multiple branches
  const [branches, setBranches] = React.useState<BranchOption[]>([]);
  const [selectedBranch, setSelectedBranch] = React.useState('');
  const [needsBranchSelection, setNeedsBranchSelection] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      const result = await login(email, password, selectedBranch || undefined);

      if (result.needsBranchSelection) {
        setBranches(result.branches);
        setNeedsBranchSelection(true);
        return;
      }

      // Login successful — redirect to workspace
      router.replace('/');
    } catch {
      // Error is already set in the store
    }
  };

  const handleBranchConfirm = async () => {
    if (!selectedBranch) return;
    clearError();
    try {
      const result = await login(email, password, selectedBranch);
      if (!result.needsBranchSelection) {
        router.replace('/');
      }
    } catch {
      // Error is already set in the store
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border/60 px-6 py-3 flex items-center gap-3 select-none">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building2 className="h-4 w-4" />
        </div>
        <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
          Xtechs ERP
        </span>
        <Badge
          variant="outline"
          className="ml-1 font-mono text-[9px] text-muted-foreground px-1.5 py-0 border-border"
        >
          v0.1.0-dev
        </Badge>
      </div>

      {/* Login form centred */}
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-[380px] space-y-6">
          {/* Card header */}
          <div className="space-y-1 select-none">
            <h1 className="text-xl font-bold tracking-tight text-foreground font-sans">
              Sign in to your workspace
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              Internal access only. Contact your system administrator if you need an account.
            </p>
          </div>

          {/* Branch selection view */}
          {needsBranchSelection ? (
            <div className="rounded-md border border-border bg-card p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Select a Branch</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Your account has access to multiple branches.
                </p>
              </div>
              <div className="space-y-1">
                {branches.map((branch) => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => setSelectedBranch(branch.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs font-mono border transition-colors cursor-pointer ${
                      selectedBranch === branch.id
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-border bg-background text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <p className="text-[11px] text-destructive">{error}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs h-8 border-border"
                  onClick={() => {
                    setNeedsBranchSelection(false);
                    setSelectedBranch('');
                    clearError();
                  }}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={handleBranchConfirm}
                  disabled={!selectedBranch || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Continue'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* Login form */
            <form onSubmit={handleSubmit} className="rounded-md border border-border bg-card p-5 space-y-4">
              {/* Error alert */}
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <p className="text-[11px] text-destructive">{error}</p>
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@xtechs.local"
                    className="pl-8 h-9 text-xs border-border bg-background font-mono"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-8 pr-9 h-9 text-xs border-border bg-background font-mono"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-9 text-sm font-semibold"
                disabled={isLoading || !email || !password}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authenticating...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          )}

          {/* Footer note */}
          <p className="text-center text-[10px] text-muted-foreground font-mono select-none">
            Session secured with HttpOnly cookies · JWT RS256
          </p>
        </div>
      </div>
    </div>
  );
}
