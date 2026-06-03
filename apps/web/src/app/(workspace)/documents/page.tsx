'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, RefreshCw, FileText, Eye, MoreHorizontal, Loader2, AlertCircle } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDocuments, type DocumentRecord } from '@/hooks/use-api';

// ─── Document type options ────────────────────────────────────
const DOCUMENT_TYPES = [
  { id: 'invoice', label: 'Invoices' },
  { id: 'purchase_order', label: 'Purchase Orders' },
  { id: 'journal_entry', label: 'Journal Entries' },
  { id: 'payment', label: 'Payments' },
  { id: 'receipt', label: 'Receipts' },
] as const;

// ─── Status badge helper ──────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
  if (s === 'pending_approval') cls = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
  else if (s === 'approved') cls = 'bg-status-approved text-status-approved-foreground border-status-approved/30';
  else if (s === 'posted') cls = 'bg-status-posted text-status-posted-foreground border-status-posted/30';
  else if (s === 'rejected') cls = 'bg-status-rejected text-status-rejected-foreground border-status-rejected/30';
  else if (s === 'archived') cls = 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${cls}`}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

// ─── Columns ─────────────────────────────────────────────────
const columns: ColumnDef<DocumentRecord>[] = [
  {
    accessorKey: 'docNumber',
    header: 'Document No.',
    cell: ({ row }) => (
      <span className="font-mono font-semibold tracking-tight text-foreground">
        {row.getValue('docNumber') ?? <span className="text-muted-foreground italic">—</span>}
      </span>
    ),
  },
  {
    accessorKey: 'documentType',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 font-medium">
        {String(row.getValue('documentType')).replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.getValue('status')} />,
  },
  {
    accessorKey: 'workflowState',
    header: 'Workflow State',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-muted-foreground">
        {String(row.getValue('workflowState')).replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground">
        {new Date(row.getValue('createdAt')).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })}
      </span>
    ),
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted p-0">
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase py-1">Actions</DropdownMenuLabel>
          <DropdownMenuItem className="cursor-pointer text-xs py-1.5 flex gap-1.5">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span>View Document</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────
export default function DocumentsPage() {
  const [activeType, setActiveType] = React.useState('invoice');
  const { data, isLoading, isError, refetch } = useDocuments(activeType);

  const documents = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Documents
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {total > 0 ? `${total.toLocaleString()} total records` : 'Business documents and entries'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border gap-1.5"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Document
          </Button>
        </div>
      </div>

      {/* Type selector tabs */}
      <div className="flex items-center gap-1 border-b border-border/40 pb-0 select-none -mb-1">
        {DOCUMENT_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => setActiveType(type.id)}
            className={`px-3 py-2 text-[11px] font-mono font-semibold border-b-2 transition-colors cursor-pointer ${
              activeType === type.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2 select-none">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading documents...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Failed to load documents</p>
            <p className="text-[11px] text-destructive/80 font-mono mt-0.5">
              Check that the API server is running and you are authenticated.
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Data table */}
      {!isLoading && !isError && (
        <DataTable
          columns={columns}
          data={documents}
          searchColumn="documentType"
          searchPlaceholder={`Filter ${activeType.replace(/_/g, ' ')} documents...`}
        />
      )}
    </div>
  );
}
