'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  FileText,
  Receipt,
  Boxes,
  Users,
  History,
  CornerDownLeft,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useUIStore } from '@/store/ui-store';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Helper hook for debouncing search query
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface SearchResult {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string | null;
  urlPath: string;
  metadata: {
    status?: string;
    [key: string]: any;
  };
  rank: number;
}

export function GlobalSearch() {
  const open = useUIStore((state) => state.searchOpen);
  const setOpen = useUIStore((state) => state.setSearchOpen);
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebounce(query, 200);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const resultsContainerRef = React.useRef<HTMLDivElement>(null);

  // Setup hotkey (Cmd+K / Ctrl+K)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, setOpen]);

  // Reset query and selection when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  // Fetch results via TanStack Query from Search Engine API route
  const { data: results = [], isLoading, error } = useQuery<SearchResult[]>({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      
      // Call rewrite route which proxies to Fastify server's /api/v1/search
      // Note: rewritten /api/:path* maps to backend /:path*, so calling /api/api/v1/search
      const response = await fetch(`/api/api/v1/search?q=${encodeURIComponent(debouncedQuery)}`);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      return response.json();
    },
    enabled: debouncedQuery.trim().length > 0,
    staleTime: 5000,
  });

  // Handle keyboard navigation inside search list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (selected) {
        // In full ERP, we would use Next.js router.push(selected.urlPath)
        console.log(`Navigating to: ${selected.urlPath}`);
        alert(`Navigate to entity: ${selected.title} (${selected.entityType})`);
        setOpen(false);
      }
    }
  };

  // Scroll selected item into view
  React.useEffect(() => {
    if (resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Helper to map entityType to Lucide Icon
  const getEntityIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'invoice':
      case 'po':
      case 'document':
        return FileText;
      case 'payment':
      case 'journal_entry':
        return Receipt;
      case 'stock_entry':
      case 'product':
        return Boxes;
      case 'customer':
      case 'supplier':
      case 'user':
        return Users;
      case 'audit_log':
        return History;
      default:
        return FileText;
    }
  };

  // Helper to map document status to styling class
  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    const s = status.toLowerCase();
    
    // Status badges: Draft -> Gray, Pending Approval -> Yellow, Approved -> Blue, Posted -> Green, Rejected -> Red, Archived -> Muted Gray
    let badgeClass = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
    if (s === 'pending_approval' || s === 'pending') {
      badgeClass = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
    } else if (s === 'approved') {
      badgeClass = 'bg-status-approved text-status-approved-foreground border-status-approved/30';
    } else if (s === 'posted') {
      badgeClass = 'bg-status-posted text-status-posted-foreground border-status-posted/30';
    } else if (s === 'rejected' || s === 'reversed') {
      badgeClass = 'bg-status-rejected text-status-rejected-foreground border-status-rejected/30';
    } else if (s === 'archived') {
      badgeClass = 'bg-status-archived text-status-archived-foreground border-status-archived/30';
    }

    return (
      <Badge variant="outline" className={cn('text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1', badgeClass)}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden border border-border bg-card shadow-2xl rounded-md">
        <DialogTitle className="sr-only">Global Search Dialog</DialogTitle>
        {/* Search Input Area */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search documents, entities, audit logs (e.g. INV-2026-001)..."
            className="flex-1 border-0 bg-transparent p-0 text-sm font-sans focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground h-auto"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[9px] font-medium text-muted-foreground uppercase">
            Esc
          </kbd>
        </div>

        {/* Results / Info Area */}
        <div className="max-h-[350px] overflow-y-auto" ref={resultsContainerRef}>
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2 text-xs">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Searching database...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-destructive gap-2 text-xs px-4 text-center">
              <AlertCircle className="h-4.5 w-4.5 shrink-0" />
              <span>Error fetching search results. Ensure the server is online.</span>
            </div>
          )}

          {!isLoading && !error && query && results.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No results found for &ldquo;<span className="font-mono text-foreground font-medium">{query}</span>&rdquo;
            </div>
          )}

          {!isLoading && !error && !query && (
            <div className="py-8 px-4 text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
              <div className="rounded-full bg-muted/40 p-2 text-muted-foreground">
                <Search className="h-5 w-5" />
              </div>
              <p className="font-medium text-foreground">ERP Global Search Engine</p>
              <p className="text-[11px] text-muted-foreground max-w-[320px] leading-relaxed">
                Type to search across Invoices, Purchase Orders, Journal Entries, Customers, Suppliers, and Audit trails.
              </p>
            </div>
          )}

          {!isLoading && !error && results.length > 0 && (
            <div className="p-1.5 flex flex-col gap-0.5">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2.5 py-1.5 border-b border-border/40">
                Search Results ({results.length})
              </div>
              {results.map((result, idx) => {
                const Icon = getEntityIcon(result.entityType);
                const isActive = idx === selectedIndex;
                return (
                  <div
                    key={result.id}
                    data-active={isActive}
                    onClick={() => {
                      alert(`Navigate to entity: ${result.title} (${result.entityType})`);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors select-none',
                      isActive 
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary pl-2.5 rounded-l-none' 
                        : 'hover:bg-muted/40 text-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex h-7 w-7 items-center justify-center rounded border',
                      isActive ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted border-border text-muted-foreground'
                    )}>
                      <Icon className="h-4 w-4 shrink-0" />
                    </div>

                    <div className="flex-1 min-w-0 leading-snug">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold tracking-tight truncate">
                          {result.title}
                        </span>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-mono font-medium border-border bg-muted/50 px-1 py-0 text-muted-foreground">
                          {result.entityType}
                        </Badge>
                        {getStatusBadge(result.metadata?.status)}
                      </div>
                      {result.description && (
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {result.description}
                        </p>
                      )}
                    </div>

                    {isActive && (
                      <div className="flex items-center gap-1 text-muted-foreground font-mono text-[9px] uppercase tracking-wider bg-background px-1.5 py-0.5 rounded border border-border">
                        <span>Select</span>
                        <CornerDownLeft className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
