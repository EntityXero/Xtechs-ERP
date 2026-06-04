'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ShoppingBag,
  RefreshCw,
  Loader2,
  AlertCircle,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDocuments, type DocumentRecord } from '@/hooks/use-api';

// ─── Status badge helper ──────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
  if (s === 'pending_approval') cls = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
  else if (s === 'approved') cls = 'bg-status-approved text-status-approved-foreground border-status-approved/30';
  else if (s === 'posted') cls = 'bg-status-posted text-status-posted-foreground border-status-posted/30';
  else if (s === 'rejected') cls = 'bg-status-rejected text-status-rejected-foreground border-status-rejected/30';
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
    header: 'Invoice No.',
    cell: ({ row }) => (
      <span className="font-mono font-semibold tracking-tight text-foreground">
        {row.getValue('docNumber') ?? <span className="text-muted-foreground italic">—</span>}
      </span>
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
      <span className="font-mono text-[11px] text-muted-foreground capitalize">
        {String(row.getValue('workflowState')).replace(/_/g, ' ')}
      </span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(row.getValue('createdAt')).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })}
      </span>
    ),
  },
];

export default function SalesPage() {
  const { data, isLoading, isError, refetch } = useDocuments('invoice');

  const invoices = data?.data ?? [];
  const total = data?.total ?? 0;
  const postedCount = invoices.filter((doc) => doc.status === 'POSTED').length;
  const draftCount = invoices.filter((doc) => doc.status === 'DRAFT').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Sales Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Manage quotations, customer orders, and sales invoicing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border gap-1.5"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button asChild size="sm" className="h-8 text-xs gap-1.5">
            <Link href="/documents/invoice/new">
              <Plus className="h-3.5 w-3.5" />
              New Invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 select-none">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Invoices</span>
            <div className="rounded-full bg-primary/10 p-1 text-primary">
              <ShoppingBag className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">{total}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Total billing records issued</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Posted Revenue Invoices</span>
            <div className="rounded-full bg-status-posted/10 p-1 text-status-posted">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">{postedCount}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Invoices finalized and posted to accounts</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Draft Invoices</span>
            <div className="rounded-full bg-status-pending/10 p-1 text-status-pending">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">{draftCount}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Pending approval or editing</p>
        </div>
      </div>

      {/* Main Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <h2 className="text-sm font-bold tracking-tight text-foreground font-sans">Recent Sales Invoices</h2>
          <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground px-1.5 py-0 border-border">
            <TrendingUp className="h-2.5 w-2.5 mr-1" />
            Live
          </Badge>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
            <span className="text-xs text-muted-foreground font-mono">Loading invoices...</span>
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">Failed to load sales data.</p>
            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && (
          <DataTable
            columns={columns}
            data={invoices}
            searchColumn="docNumber"
            searchPlaceholder="Search invoices..."
          />
        )}
      </div>
    </div>
  );
}
