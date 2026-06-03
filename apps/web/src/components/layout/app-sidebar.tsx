'use client';

import * as React from 'react';
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
  Key,
} from 'lucide-react';
import { useUIStore } from '@/store/ui-store';
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

// Mock Business/Branches list
const businesses = [
  { id: 'b1', name: 'Xtechs Corporate', branch: 'Main HQ' },
  { id: 'b2', name: 'Xtechs Logistics', branch: 'Warehouse A' },
  { id: 'b3', name: 'Xtechs Retail', branch: 'London Branch' },
];

export function AppSidebar() {
  const activeModule = useUIStore((state) => state.activeModule);
  const setActiveModule = useUIStore((state) => state.setActiveModule);
  const [selectedBiz, setSelectedBiz] = React.useState<{ id: string; name: string; branch: string }>(businesses[0]!);

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
                  {selectedBiz.name}
                </span>
                <span className="text-[10px] text-muted-foreground truncate font-mono">
                  {selectedBiz.branch}
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
            {businesses.map((biz) => (
              <DropdownMenuItem
                key={biz.id}
                onClick={() => setSelectedBiz(biz)}
                className="flex flex-col items-start gap-0.5 px-2 py-1.5 cursor-pointer"
              >
                <span className="font-mono text-xs font-medium text-foreground">
                  {biz.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {biz.branch}
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
                  const isActive = activeModule === item.id;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setActiveModule(item.id)}
                        className={cn(
                          'h-8 px-2.5 py-1 text-xs font-medium font-sans flex items-center gap-2.5 rounded-md transition-colors',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold border-l-2 border-primary rounded-l-none'
                            : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
                        )}
                        tooltip={item.label}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
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
                  AD
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5 text-left leading-none overflow-hidden">
                <span className="text-xs font-semibold text-foreground truncate">
                  Admin User
                </span>
                <span className="text-[10px] text-muted-foreground truncate font-mono">
                  admin@xtechs.local
                </span>
              </div>
              <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" side="top">
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
              <span className="text-xs font-semibold text-foreground">Admin User</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-bold uppercase tracking-wider text-primary border-primary/30 bg-primary/5">
                  Superuser
                </Badge>
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono font-bold uppercase tracking-wider text-status-posted border-status-posted/30 bg-status-posted/5">
                  HQ
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
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs py-1.5">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              <span>API Credentials</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs py-1.5 text-destructive focus:bg-destructive/10 focus:text-destructive">
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
