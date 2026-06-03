'use client';

import * as React from 'react';
import { useUIStore } from '@/store/ui-store';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { AppHeader } from './app-header';

interface WorkspaceLayoutProps {
  children: React.ReactNode;
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        {/* App Sidebar Component */}
        <AppSidebar />

        {/* Main Content Inset */}
        <SidebarInset className="flex flex-col min-w-0">
          {/* Main Top Header */}
          <AppHeader />

          {/* Page Content Container */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
