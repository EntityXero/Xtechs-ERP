'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Users, RefreshCw, Loader2, AlertCircle, UserPlus, Target, Handshake } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useCrmCustomers,
  useCrmLeads,
  useCrmOpportunities,
  type CustomerRecord,
  type LeadRecord,
  type OpportunityRecord,
} from '@/hooks/use-api';

// ─── Customer columns ──────────────────────────────────────────
const customerColumns: ColumnDef<CustomerRecord>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.getValue('name')}</span>
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.getValue('email')}</span>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.getValue('phone') ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const s = String(row.getValue('status')).toLowerCase();
      const cls = s === 'active'
        ? 'bg-status-posted/10 text-status-posted border-status-posted/30'
        : 'bg-muted text-muted-foreground border-border';
      return (
        <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${cls}`}>
          {row.getValue('status')}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(row.getValue('createdAt')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </span>
    ),
  },
];

// ─── Lead columns ──────────────────────────────────────────────
const leadColumns: ColumnDef<LeadRecord>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">
        {row.original.firstName} {row.original.lastName}
      </span>
    ),
  },
  {
    accessorKey: 'company',
    header: 'Company',
    cell: ({ row }) => (
      <span className="text-foreground">{row.getValue('company') ?? <span className="text-muted-foreground italic text-[11px]">—</span>}</span>
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.getValue('email')}</span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const s = String(row.getValue('status')).toLowerCase();
      let cls = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
      if (s === 'contacted') cls = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
      if (s === 'qualified') cls = 'bg-status-posted/10 text-status-posted border-status-posted/30';
      if (s === 'lost') cls = 'bg-destructive/10 text-destructive border-destructive/30';
      return (
        <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${cls}`}>
          {row.getValue('status')}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(row.getValue('createdAt')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </span>
    ),
  },
];

// ─── Opportunity columns ───────────────────────────────────────
const opportunityColumns: ColumnDef<OpportunityRecord>[] = [
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ row }) => (
      <span className="font-medium text-foreground max-w-[200px] truncate block">{row.getValue('title')}</span>
    ),
  },
  {
    accessorKey: 'expectedValue',
    header: 'Expected Value',
    cell: ({ row }) => (
      <span className="font-mono text-right block">
        {parseFloat(String(row.getValue('expectedValue'))).toLocaleString('en-US', {
          style: 'currency', currency: 'USD',
        })}
      </span>
    ),
  },
  {
    accessorKey: 'stage',
    header: 'Stage',
    cell: ({ row }) => {
      const s = String(row.getValue('stage')).toLowerCase();
      let cls = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
      if (s === 'proposal') cls = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
      if (s === 'negotiation') cls = 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      if (s === 'won') cls = 'bg-status-posted/10 text-status-posted border-status-posted/30';
      if (s === 'lost') cls = 'bg-destructive/10 text-destructive border-destructive/30';
      return (
        <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${cls}`}>
          {String(row.getValue('stage')).replace(/_/g, ' ')}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'expectedCloseDate',
    header: 'Close Date',
    cell: ({ row }) => {
      const d = row.getValue('expectedCloseDate');
      return d ? (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(d as string).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ) : <span className="text-muted-foreground text-[11px] italic">—</span>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(row.getValue('createdAt')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </span>
    ),
  },
];

// ─── Tab type ─────────────────────────────────────────────────
type CrmTab = 'customers' | 'leads' | 'opportunities';

// ─── Page ─────────────────────────────────────────────────────
export default function CrmPage() {
  const [tab, setTab] = React.useState<CrmTab>('customers');

  const customersQuery = useCrmCustomers();
  const leadsQuery = useCrmLeads();
  const opportunitiesQuery = useCrmOpportunities();

  const activeQuery = tab === 'customers' ? customersQuery : tab === 'leads' ? leadsQuery : opportunitiesQuery;
  const total = activeQuery.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            CRM
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {total > 0 ? `${total.toLocaleString()} records` : 'Customers, leads, and sales pipeline'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-border gap-1.5"
          onClick={() => activeQuery.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-border/40 select-none">
        {([
          { id: 'customers', label: 'Customers', icon: Handshake },
          { id: 'leads', label: 'Leads', icon: UserPlus },
          { id: 'opportunities', label: 'Opportunities', icon: Target },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {activeQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2 select-none">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading {tab}...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {activeQuery.isError && !activeQuery.isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Failed to load data. Check API server connectivity.</p>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => activeQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Tables */}
      {!activeQuery.isLoading && !activeQuery.isError && tab === 'customers' && (
        <DataTable
          columns={customerColumns}
          data={customersQuery.data?.data ?? []}
          searchColumn="name"
          searchPlaceholder="Search customers..."
        />
      )}

      {!activeQuery.isLoading && !activeQuery.isError && tab === 'leads' && (
        <DataTable
          columns={leadColumns}
          data={leadsQuery.data?.data ?? []}
          searchColumn="email"
          searchPlaceholder="Search leads..."
        />
      )}

      {!activeQuery.isLoading && !activeQuery.isError && tab === 'opportunities' && (
        <DataTable
          columns={opportunityColumns}
          data={opportunitiesQuery.data?.data ?? []}
          searchColumn="title"
          searchPlaceholder="Search opportunities..."
        />
      )}
    </div>
  );
}
