'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Boxes,
  Users,
  Contact,
  Settings,
  History,
  Building2,
  ChevronDown,
  LogOut,
  User,
  Shield,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

// Navigation groups & items
const menuGroups = [
  {
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
      { id: 'documents', label: 'Documents', icon: FileText, path: '/documents' },
    ],
  },
  {
    label: 'Modules',
    items: [
      { id: 'accounting', label: 'Accounting', icon: Receipt, path: '/accounting' },
      { id: 'inventory', label: 'Inventory', icon: Boxes, path: '/inventory' },
      { id: 'crm', label: 'CRM', icon: Users, path: '/crm' },
      { id: 'sales', label: 'Sales', icon: ShoppingBag, path: '/sales' },
      { id: 'purchasing', label: 'Purchasing', icon: ShoppingCart, path: '/purchasing' },
      { id: 'hr', label: 'HR Management', icon: Contact, path: '/hr' },
    ],
  },
  {
    label: 'System & Admin',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
      { id: 'audit', label: 'Audit Logs', icon: History, path: '/audit' },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, scope, accessibleBranches, switchBranch } = useAuthStore();

  const currentBranch = accessibleBranches.find((b) => b.id === scope?.branchId);
  const activeBranchName = currentBranch?.name ?? 'Head Office';
  const activeBusinessName = currentBranch?.businessName ?? 'Xtechs Pvt Ltd';

  const handleLogout = async () => {
    await logout();
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar select-none">
      {/* Header: Company/Branch Switcher */}
      <SidebarHeader className="h-[52px] border-b border-border px-3 flex justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground py-1 px-2"
            >
              <div className="flex aspect-square h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-0.5 text-left leading-tight overflow-hidden">
                <span className="font-mono text-xs font-semibold tracking-tight text-foreground truncate">
                  {activeBusinessName}
                </span>
                <span className="text-[10px] text-muted-foreground truncate font-mono">
                  {activeBranchName}
                </span>
              </div>
              <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuLabel className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 py-1.5">
              Switch Business Unit
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accessibleBranches.map((branch) => (
              <DropdownMenuItem
                key={branch.id}
                onClick={async () => {
                  try {
                    await switchBranch(branch.id);
                  } catch (err) {
                    console.error('Failed to switch branch:', err);
                  }
                }}
                className={cn(
                  "flex flex-col items-start gap-0.5 px-2 py-1.5 cursor-pointer",
                  branch.id === scope?.branchId && "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                )}
              >
                <span className="font-mono text-xs font-medium text-foreground">
                  {branch.businessName}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {branch.name}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      {/* Main Navigation Content */}
      <SidebarContent className="px-2 py-2 gap-4">
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label} className="p-0">
            <SidebarGroupLabel className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase px-2 mb-1">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className={cn(
                          'h-8 px-2.5 py-1 text-xs font-medium font-sans flex items-center gap-2.5 rounded-md transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-primary rounded-l-none'
                            : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
                        )}
                        tooltip={item.label}
                      >
                        <Link href={item.path}>
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarSeparator />

      {/* Footer: User Profile / Context details */}
      <SidebarFooter className="p-2 border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="w-full data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground py-1.5 px-2"
            >
              <Avatar className="h-7 w-7 rounded-md">
                <AvatarImage src="" alt="User avatar" />
                <AvatarFallback className="bg-primary/10 text-primary font-bold font-mono text-xs rounded-md">
                  {user?.displayName?.slice(0, 2).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5 text-left leading-none overflow-hidden">
                <span className="text-xs font-semibold text-foreground truncate">
                  {user?.displayName ?? 'User'}
                </span>
                <span className="text-[10px] text-muted-foreground truncate font-mono">
                  {user?.email ?? ''}
                </span>
              </div>
              <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" side="top">
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
              <span className="text-xs font-semibold text-foreground">{user?.displayName ?? 'User'}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-bold uppercase tracking-wider text-primary border-primary/30 bg-primary/5">
                  Active
                </Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs py-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span>User Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs py-1.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Security Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-xs py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
