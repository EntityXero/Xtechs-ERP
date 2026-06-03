'use client';

import * as React from 'react';
import { Search, Bell, History } from 'lucide-react';
import { useUIStore } from '@/store/ui-store';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlobalSearch } from './global-search';

export function AppHeader() {
  const activeModule = useUIStore((state) => state.activeModule);
  const setSearchOpen = useUIStore((state) => state.setSearchOpen);

  // Helper to format module title
  const getModuleTitle = (mod: string) => {
    switch (mod) {
      case 'dashboard':
        return 'Dashboard';
      case 'documents':
        return 'Documents & Records';
      case 'accounting':
        return 'General Ledger & Accounting';
      case 'inventory':
        return 'Inventory & Warehouse';
      case 'crm':
        return 'Customer Relationships';
      case 'hr':
        return 'Human Resources';
      case 'settings':
        return 'System Configuration';
      case 'audit':
        return 'Security Audit Logs';
      default:
        return mod.charAt(0).toUpperCase() + mod.slice(1);
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-[52px] w-full items-center gap-4 border-b border-border bg-card px-4 select-none">
      {/* Left: Sidebar Trigger & Breadcrumbs */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <SidebarTrigger className="h-8 w-8 hover:bg-muted" />
        <Separator orientation="vertical" className="h-4 bg-border" />
        
        <Breadcrumb className="hidden sm:block">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="font-mono text-[11px] tracking-tight">
                XTECHS ERP
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="text-muted-foreground/50" />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-sans text-[11px] font-semibold text-foreground tracking-tight uppercase">
                {getModuleTitle(activeModule)}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Middle/Right: Global Search & Shortcuts */}
      <div className="flex items-center gap-3">
        {/* Search trigger button styled as an input box */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-8 w-48 sm:w-64 items-center justify-between gap-2 rounded border border-border bg-muted/30 hover:bg-muted/70 hover:border-muted-foreground/30 px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors cursor-pointer outline-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/75" />
            <span className="truncate">Search system...</span>
          </div>
          <kbd className="hidden sm:inline-flex h-4.5 select-none items-center gap-0.5 rounded border border-border bg-card px-1 font-mono text-[9px] font-bold text-muted-foreground leading-none">
            Ctrl+K
          </kbd>
        </button>

        {/* Audit Log / History icon shortcut */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-muted"
          onClick={() => useUIStore.getState().setActiveModule('audit')}
          title="View Audit Logs"
        >
          <History className="h-4 w-4 text-muted-foreground" />
        </Button>

        {/* Notifications Icon (Mock badge) */}
        <div className="relative">
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" title="Notifications">
            <Bell className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Badge className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-pending text-status-pending-foreground border-card p-0 text-[8px] font-bold font-mono">
            3
          </Badge>
        </div>
      </div>

      {/* Global Search Dialog Root */}
      <GlobalSearch />
    </header>
  );
}
