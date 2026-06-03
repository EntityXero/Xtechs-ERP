'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt, RefreshCw, Loader2, AlertCircle, BookOpen, Layers } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAccounts, useJournalEntries, type AccountRecord, type JournalEntryRecord } from '@/hooks/use-api';

// ─── Accounts columns ─────────────────────────────────────────
const accountColumns: ColumnDef<AccountRecord>[] = [
  {
    accessorKey: 'code',
    header: 'Account Code',
    cell: ({ row }) => (
      <span className="font-mono font-bold tracking-tight text-foreground">{row.getValue('code')}</span>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Account Name',
    cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue('name')}</span>,
  },
  {
    accessorKey: 'accountType',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 capitalize">
        {String(row.getValue('accountType')).replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    accessorKey: 'openingBalance',
    header: 'Opening Balance',
    cell: ({ row }) => (
      <span className="font-mono text-right block">
        {parseFloat(String(row.getValue('openingBalance'))).toLocaleString('en-US', {
          style: 'currency', currency: 'USD',
        })}
      </span>
    ),
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={row.getValue('isActive')
          ? 'text-[9px] font-mono font-bold bg-status-posted/10 text-status-posted border-status-posted/30'
          : 'text-[9px] font-mono font-bold bg-muted text-muted-foreground border-border'
        }
      >
        {row.getValue('isActive') ? 'ACTIVE' : 'INACTIVE'}
      </Badge>
    ),
  },
];

// ─── Journal Entry columns ────────────────────────────────────
const journalColumns: ColumnDef<JournalEntryRecord>[] = [
  {
    accessorKey: 'entryNumber',
    header: 'Entry No.',
    cell: ({ row }) => (
      <span className="font-mono font-bold tracking-tight text-foreground">{row.getValue('entryNumber')}</span>
    ),
  },
  {
    accessorKey: 'entryDate',
    header: 'Date',
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground">
        {new Date(row.getValue('entryDate')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </span>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="text-foreground max-w-[240px] truncate block">
        {row.getValue('description') ?? <span className="text-muted-foreground italic text-[11px]">No description</span>}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const s = String(row.getValue('status')).toLowerCase();
      const cls = s === 'posted'
        ? 'bg-status-posted/10 text-status-posted border-status-posted/30'
        : s === 'draft'
        ? 'bg-status-draft text-status-draft-foreground border-status-draft/30'
        : 'bg-status-pending text-status-pending-foreground border-status-pending/30';
      return (
        <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${cls}`}>
          {row.getValue('status')}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'isReversal',
    header: 'Reversal',
    cell: ({ row }) =>
      row.getValue('isReversal') ? (
        <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 text-status-rejected">
          Reversal
        </Badge>
      ) : null,
  },
];

// ─── Sub navigation ───────────────────────────────────────────
type AccountingTab = 'accounts' | 'journal-entries';

// ─── Page ─────────────────────────────────────────────────────
export default function AccountingPage() {
  const [tab, setTab] = React.useState<AccountingTab>('accounts');

  const accountsQuery = useAccounts();
  const journalQuery = useJournalEntries();

  const activeQuery = tab === 'accounts' ? accountsQuery : journalQuery;
  const activeData = tab === 'accounts'
    ? (accountsQuery.data?.data ?? [])
    : (journalQuery.data?.data ?? []);
  const total = activeQuery.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Accounting
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {total > 0 ? `${total.toLocaleString()} records` : 'Chart of accounts and journal entries'}
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
          { id: 'accounts', label: 'Chart of Accounts', icon: Layers },
          { id: 'journal-entries', label: 'Journal Entries', icon: BookOpen },
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
            <p className="text-xs text-muted-foreground font-mono">Loading {tab === 'accounts' ? 'chart of accounts' : 'journal entries'}...</p>
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
      {!activeQuery.isLoading && !activeQuery.isError && tab === 'accounts' && (
        <DataTable
          columns={accountColumns}
          data={accountsQuery.data?.data ?? []}
          searchColumn="name"
          searchPlaceholder="Search accounts..."
        />
      )}

      {!activeQuery.isLoading && !activeQuery.isError && tab === 'journal-entries' && (
        <DataTable
          columns={journalColumns}
          data={journalQuery.data?.data ?? []}
          searchColumn="entryNumber"
          searchPlaceholder="Search journal entries..."
        />
      )}
    </div>
  );
}
