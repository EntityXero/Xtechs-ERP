'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Contact, RefreshCw, Loader2, AlertCircle, UsersRound, Building } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useHrEmployees,
  useHrDepartments,
  type EmployeeRecord,
  type DepartmentRecord,
} from '@/hooks/use-api';

// ─── Employee columns ──────────────────────────────────────────
const employeeColumns: ColumnDef<EmployeeRecord>[] = [
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
    accessorKey: 'dateOfJoining',
    header: 'Joining Date',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">
        {new Date(row.getValue('dateOfJoining')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
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
        : 'bg-destructive/10 text-destructive border-destructive/30';
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

// ─── Department columns ────────────────────────────────────────
const departmentColumns: ColumnDef<DepartmentRecord>[] = [
  {
    accessorKey: 'name',
    header: 'Department Name',
    cell: ({ row }) => (
      <span className="font-medium text-foreground">{row.getValue('name')}</span>
    ),
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
type HrTab = 'employees' | 'departments';

// ─── Page ─────────────────────────────────────────────────────
export default function HrPage() {
  const [tab, setTab] = React.useState<HrTab>('employees');

  const employeesQuery = useHrEmployees();
  const departmentsQuery = useHrDepartments();

  const activeQuery = tab === 'employees' ? employeesQuery : departmentsQuery;
  const total = activeQuery.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <Contact className="h-5 w-5 text-primary" />
            HR Management
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {total > 0 ? `${total.toLocaleString()} records` : 'Employees, departments, and leave management'}
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
          { id: 'employees', label: 'Employees', icon: UsersRound },
          { id: 'departments', label: 'Departments', icon: Building },
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
      {!activeQuery.isLoading && !activeQuery.isError && tab === 'employees' && (
        <DataTable
          columns={employeeColumns}
          data={employeesQuery.data?.data ?? []}
          searchColumn="email"
          searchPlaceholder="Search employees..."
        />
      )}

      {!activeQuery.isLoading && !activeQuery.isError && tab === 'departments' && (
        <DataTable
          columns={departmentColumns}
          data={departmentsQuery.data?.data ?? []}
          searchColumn="name"
          searchPlaceholder="Search departments..."
        />
      )}
    </div>
  );
}
