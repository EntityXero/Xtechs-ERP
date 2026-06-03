'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Eye, EyeOff, Loader2, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useChangePassword } from '@/hooks/use-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, checkSession, logout } = useAuthStore();
  const changePasswordMutation = useChangePassword();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const [localError, setLocalError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword !== confirmPassword) {
      setLocalError('New passwords do not match');
      return;
    }

    if (newPassword === currentPassword) {
      setLocalError('New password must be different from current password');
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });

      setSuccess(true);
      
      // Update session to clear the forcePasswordChange flag
      await checkSession();

      // Redirect to home
      setTimeout(() => {
        router.replace('/');
      }, 1500);
    } catch (err: any) {
      setLocalError(err?.message || 'Failed to change password. Please verify current password.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
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
        <Button
          variant="ghost"
          size="sm"
          className="text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => logout().then(() => router.replace('/login'))}
        >
          Sign Out
        </Button>
      </div>

      {/* Main card */}
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-[420px] space-y-6">
          <div className="space-y-1 select-none">
            <h1 className="text-xl font-bold tracking-tight text-foreground font-sans">
              Update your password
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              For security, you must update your temporary password before accessing the system.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-md border border-border bg-card p-5 space-y-4">
            {/* Error alert */}
            {localError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <p className="text-[11px] text-destructive font-mono">{localError}</p>
              </div>
            )}

            {/* Success alert */}
            {success && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <p className="text-[11px] text-emerald-500 font-mono">Password updated successfully! Redirecting...</p>
              </div>
            )}

            {/* Current Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="currentPassword"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono"
              >
                Current Password
              </label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={success || changePasswordMutation.isPending}
                  className="pl-8 pr-9 h-9 text-xs border-border bg-background font-mono"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="newPassword"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="newPassword"
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={success || changePasswordMutation.isPending}
                  className="pl-8 pr-9 h-9 text-xs border-border bg-background font-mono"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground font-mono leading-normal">
                Min 8 chars, 1 uppercase, 1 lowercase, 1 number, and 1 special char.
              </p>
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirmPassword"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={success || changePasswordMutation.isPending}
                  className="pl-8 pr-9 h-9 text-xs border-border bg-background font-mono"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-9 text-sm font-semibold cursor-pointer"
              disabled={changePasswordMutation.isPending || success || !currentPassword || !newPassword || !confirmPassword}
            >
              {changePasswordMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating password...
                </span>
              ) : (
                'Update Password'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
