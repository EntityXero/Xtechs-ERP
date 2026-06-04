'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  TrendingUp,
  Receipt,
  Boxes,
  Users,
  Plus,
  ArrowUpRight,
  Clock,
  AlertCircle,
  Eye,
  MoreHorizontal,
  FileCheck2,
  RefreshCw,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
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
import {
  useDashboardDocuments,
  useDashboardAuditLogs,
  useInventoryItems,
  useCrmCustomers,
  type DocumentRecord,
} from '@/hooks/use-api';

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
      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 font-medium capitalize">
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
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-muted p-0">
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase py-1">Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild className="cursor-pointer text-xs py-1.5 flex gap-1.5">
            <Link href={`/documents/${row.original.documentType}/${row.original.id}`}>
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              <span>View Document</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

// Helper for audit logs timeline style
function getAuditIconInfo(action: string) {
  const act = action.toLowerCase();
  if (['create', 'register', 'login'].includes(act)) {
    return { icon: FileCheck2, color: 'text-status-posted', bg: 'bg-status-posted/10' };
  }
  if (['delete', 'reject', 'revoke', 'suspend'].includes(act)) {
    return { icon: AlertCircle, color: 'text-status-rejected', bg: 'bg-status-rejected/10' };
  }
  return { icon: Clock, color: 'text-primary', bg: 'bg-primary/10' };
}

export default function DashboardPage() {
  const documentsQuery = useDashboardDocuments(1, 10);
  const auditLogsQuery = useDashboardAuditLogs();
  const inventoryQuery = useInventoryItems(1, 100);
  const crmQuery = useCrmCustomers(1, 100);

  const refetchAll = () => {
    documentsQuery.refetch();
    auditLogsQuery.refetch();
    inventoryQuery.refetch();
    crmQuery.refetch();
  };

  // Calculations
  const documentsList = documentsQuery.data?.data ?? [];
  const postedInvoicesCount = documentsList.filter((doc) => doc.status === 'POSTED').length;
  const totalInvoicesCount = documentsQuery.data?.total ?? 0;

  const totalInventoryItems = inventoryQuery.data?.total ?? 0;
  const lowStockItemsCount = (inventoryQuery.data?.data ?? []).filter(
    (item) => parseFloat(item.currentStock) <= parseFloat(item.reorderLevel || '0')
  ).length;

  const activePartnersCount = crmQuery.data?.total ?? 0;
  const recentAuditLogs = auditLogsQuery.data?.data?.slice(0, 5) ?? [];
  const totalAuditEvents = auditLogsQuery.data?.total ?? 0;

  const isLoading = documentsQuery.isLoading || auditLogsQuery.isLoading || inventoryQuery.isLoading || crmQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans">Workspace Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Overview of current business activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-border gap-1.5"
            onClick={refetchAll}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 select-none">
        {/* KPI 1: Invoices */}
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Posted Invoices</span>
            <div className="rounded-full bg-status-posted/10 p-1 text-status-posted">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">
              {postedInvoicesCount}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              / {totalInvoicesCount} total
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Invoices scoped to active branch</p>
        </div>

        {/* KPI 2: Inventory */}
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Inventory SKUs</span>
            <div className="rounded-full bg-primary/10 p-1 text-primary">
              <Boxes className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">
              {totalInventoryItems}
            </span>
            {lowStockItemsCount > 0 && (
              <span className="flex items-center font-mono text-[10px] font-medium text-status-pending">
                <Clock className="h-3 w-3 mr-0.5" />
                {lowStockItemsCount} low stock
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Stocked items in this branch</p>
        </div>

        {/* KPI 3: CRM */}
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customers</span>
            <div className="rounded-full bg-primary/10 p-1 text-primary">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">
              {activePartnersCount}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Active customer accounts</p>
        </div>

        {/* KPI 4: Security */}
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Audit logs</span>
            <div className="rounded-full bg-status-posted/10 p-1 text-status-posted">
              <ShieldCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">
              {totalAuditEvents}
            </span>
            <span className="flex items-center font-mono text-[10px] font-medium text-status-posted ml-1">
              All Secure
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Immutable events logged</p>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Documents table */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h2 className="text-sm font-bold tracking-tight text-foreground font-sans">Recent Invoices</h2>
            <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground px-1.5 py-0 border-border">
              <TrendingUp className="h-2.5 w-2.5 mr-1" />
              Live
            </Badge>
          </div>
          {documentsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 border border-border border-dashed rounded-md">
              <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
              <span className="text-xs text-muted-foreground font-mono">Loading invoices...</span>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={documentsList}
              searchColumn="docNumber"
              searchPlaceholder="Filter by doc number..."
            />
          )}
        </div>

        {/* Audit trail */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h2 className="text-sm font-bold tracking-tight text-foreground font-sans">Security Audit Trail</h2>
            <Button asChild variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:bg-muted font-semibold px-2">
              <Link href="/audit">View All</Link>
            </Button>
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-3 select-none">
            {auditLogsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
                <span className="text-xs text-muted-foreground font-mono">Loading audit logs...</span>
              </div>
            ) : recentAuditLogs.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground font-mono">
                No audit logs found.
              </div>
            ) : (
              recentAuditLogs.map((item) => {
                const info = getAuditIconInfo(item.action);
                const Icon = info.icon;
                const time = new Date(item.createdAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div key={item.id} className="flex items-start gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0">
                    <div className={`mt-0.5 rounded-full ${info.bg} p-1 ${info.color} shrink-0`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground font-sans capitalize">
                          {item.entityType.replace(/_/g, ' ')} {item.action}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground">{time}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate font-mono">
                        Actor ID: {item.actorId.slice(0, 8)} | IP: {item.ipAddress ?? 'local'}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
