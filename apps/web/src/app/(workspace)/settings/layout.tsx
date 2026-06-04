'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Building2, Users, ShieldAlert, KeyRound, Database } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Pattern matching for wildcard permissions
function matchPattern(pattern: string, value: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return value.startsWith(prefix);
  }
  return pattern === value;
}

// Helper to check permissions
function hasPermission(permissions: any[], resource: string, action: string) {
  if (!permissions) return false;
  
  const hasDeny = permissions.some(
    (p) =>
      p.effect === 'deny' &&
      matchPattern(p.resource, resource) &&
      matchPattern(p.action, action)
  );
  if (hasDeny) return false;

  return permissions.some(
    (p) =>
      p.effect === 'allow' &&
      matchPattern(p.resource, resource) &&
      matchPattern(p.action, action)
  );
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { permissions } = useAuthStore();

  // Enforce permission-based access (no hardcoded Admin checks)
  const canAccessSettings = React.useMemo(() => {
    return hasPermission(permissions, 'settings', 'read') || hasPermission(permissions, 'system', 'manage');
  }, [permissions]);

  if (!canAccessSettings) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 select-none">
        <div className="max-w-[400px] text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold font-sans text-foreground">Access Denied (403)</h3>
            <p className="text-xs text-muted-foreground font-mono">
              You do not have the required permissions to view System Settings. Contact your administrator if you believe this is an error.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild className="h-8 text-xs font-mono">
            <Link href="/">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const navItems = [
    {
      label: 'Organization',
      href: '/settings/organization',
      icon: Building2,
    },
    {
      label: 'Users Management',
      href: '/settings/users',
      icon: Users,
    },
    {
      label: 'Roles & Permissions',
      href: '/settings/roles',
      icon: Shield,
    },
    {
      label: 'Metadata Definitions',
      href: '/settings/metadata',
      icon: Database,
    },
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 bg-background overflow-hidden">
      {/* Secondary Settings Sidebar */}
      <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border/60 bg-card/40 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="font-sans text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            System Administration
          </span>
        </div>
        <nav className="p-2 flex flex-row md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium font-sans whitespace-nowrap transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-primary rounded-l-none'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Settings Page Area */}
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-background p-6">
        <div className="max-w-5xl w-full mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
