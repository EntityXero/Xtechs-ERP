'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History, RefreshCw, Loader2, AlertCircle, Filter } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuditLogs, type AuditLogRecord } from '@/hooks/use-api';

// ─── Action color mapping ─────────────────────────────────────
function actionBadge(action: string) {
  const a = action.toLowerCase();
  let cls = 'bg-muted text-muted-foreground border-border';
  if (['create', 'register', 'login'].includes(a)) cls = 'bg-status-posted/10 text-status-posted border-status-posted/30';
  else if (['update', 'transition', 'approve'].includes(a)) cls = 'bg-primary/10 text-primary border-primary/30';
  else if (['delete', 'reject', 'revoke'].includes(a)) cls = 'bg-status-rejected/10 text-status-rejected border-status-rejected/30';
  else if (['logout', 'archive'].includes(a)) cls = 'bg-status-pending/10 text-status-pending border-status-pending/30';
  return (
    <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${cls}`}>
      {action}
    </Badge>
  );
}

const columns: ColumnDef<AuditLogRecord>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Timestamp',
    cell: ({ row }) => {
      const dt = new Date(row.getValue('createdAt'));
      return (
        <div className="font-mono text-[10px] leading-tight text-muted-foreground">
          <div>{dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          <div className="text-muted-foreground/60">{dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => actionBadge(row.getValue('action')),
  },
  {
    accessorKey: 'entityType',
    header: 'Entity',
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 capitalize">
        {String(row.getValue('entityType')).replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    accessorKey: 'entityId',
    header: 'Entity ID',
    cell: ({ row }) => (
      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px] block">
        {String(row.getValue('entityId')).slice(0, 8)}…
      </span>
    ),
  },
  {
    accessorKey: 'actorId',
    header: 'Actor',
    cell: ({ row }) => (
      <span className="font-mono text-[10px] text-foreground truncate max-w-[120px] block">
        {String(row.getValue('actorId')).slice(0, 8)}…
      </span>
    ),
  },
  {
    accessorKey: 'ipAddress',
    header: 'IP Address',
    cell: ({ row }) => (
      <span className="font-mono text-[10px] text-muted-foreground">
        {row.getValue('ipAddress') ?? '—'}
      </span>
    ),
  },
];

// ─── Filter options ───────────────────────────────────────────
const ENTITY_TYPES = ['', 'user', 'document', 'account', 'inventory_item', 'workflow'];
const ACTIONS = ['', 'create', 'update', 'delete', 'login', 'logout', 'approve', 'reject', 'transition'];

export default function AuditLogsPage() {
  const [entityType, setEntityType] = React.useState('');
  const [action, setAction] = React.useState('');

  const { data, isLoading, isError, refetch } = useAuditLogs({ entityType: entityType || undefined, action: action || undefined });
  const logs = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Audit Logs
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {total > 0 ? `${total.toLocaleString()} immutable log entries` : 'Immutable system activity trail'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-border gap-1.5"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 p-3 rounded-md border border-border/60 bg-card select-none">
        <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Filter:</span>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground font-mono">Entity</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="h-7 rounded border border-border bg-background px-2 py-0.5 text-[11px] font-mono text-foreground focus:outline-none"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t || 'All'}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-muted-foreground font-mono">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-7 rounded border border-border bg-background px-2 py-0.5 text-[11px] font-mono text-foreground focus:outline-none"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a || 'All'}</option>
            ))}
          </select>
        </div>

        {(entityType || action) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
            onClick={() => { setEntityType(''); setAction(''); }}
          >
            Clear
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2 select-none">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading audit logs...</p>
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Failed to load audit logs.</p>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <DataTable
          columns={columns}
          data={logs}
          searchColumn="entityType"
          searchPlaceholder="Filter by entity type..."
        />
      )}
    </div>
  );
}
