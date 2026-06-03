'use client';

import * as React from 'react';
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

// Mock Document Interface
interface DocumentRecord {
  id: string;
  docNumber: string;
  type: string;
  partner: string;
  amount: number;
  status: string;
  date: string;
}

const columns: ColumnDef<DocumentRecord>[] = [
  {
    accessorKey: 'docNumber',
    header: 'Document No.',
    cell: ({ row }) => (
      <span className="font-mono font-semibold tracking-tight text-foreground">
        {row.getValue('docNumber')}
      </span>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 font-medium">
        {row.getValue('type')}
      </Badge>
    ),
  },
  {
    accessorKey: 'partner',
    header: 'Partner / Entity',
    cell: ({ row }) => <span className="font-medium">{row.getValue('partner')}</span>,
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('amount'));
      const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
      return <span className="font-mono font-medium text-right block">{formatted}</span>;
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue('status') as string;
      const s = status.toLowerCase();
      let badgeClass = 'bg-status-draft text-status-draft-foreground border-status-draft/30';
      if (s === 'pending_approval') badgeClass = 'bg-status-pending text-status-pending-foreground border-status-pending/30';
      else if (s === 'approved') badgeClass = 'bg-status-approved text-status-approved-foreground border-status-approved/30';
      else if (s === 'posted') badgeClass = 'bg-status-posted text-status-posted-foreground border-status-posted/30';
      else if (s === 'rejected') badgeClass = 'bg-status-rejected text-status-rejected-foreground border-status-rejected/30';
      return (
        <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-mono font-bold py-0 px-1.5 ${badgeClass}`}>
          {status.replace('_', ' ')}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'date',
    header: 'Posting Date',
    cell: ({ row }) => <span className="font-mono text-muted-foreground">{row.getValue('date')}</span>,
  },
  {
    id: 'actions',
    header: 'Actions',
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
            <span>View Record</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer text-xs py-1.5 flex gap-1.5">
            <FileCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Post Entry</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

const mockDocuments: DocumentRecord[] = [
  { id: '1', docNumber: 'INV-2026-0001', type: 'Invoice', partner: 'Acme General Services', amount: 15450.00, status: 'POSTED', date: '2026-06-01' },
  { id: '2', docNumber: 'PO-2026-0042', type: 'Purchase Order', partner: 'Apex Global Suppliers', amount: 8900.00, status: 'PENDING_APPROVAL', date: '2026-06-02' },
  { id: '3', docNumber: 'INV-2026-0002', type: 'Invoice', partner: 'Delta Consulting Inc', amount: 3200.00, status: 'DRAFT', date: '2026-06-03' },
  { id: '4', docNumber: 'JE-2026-0104', type: 'Journal Entry', partner: 'Opening Balance Adjustment', amount: 120000.00, status: 'POSTED', date: '2026-05-31' },
  { id: '5', docNumber: 'PO-2026-0043', type: 'Purchase Order', partner: 'Prime Hardware Corp', amount: 450.00, status: 'APPROVED', date: '2026-06-03' },
  { id: '6', docNumber: 'INV-2026-0003', type: 'Invoice', partner: 'Acme General Services', amount: 7800.00, status: 'REJECTED', date: '2026-06-02' },
];

export default function DashboardPage() {
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
          <Button size="sm" className="h-8 text-xs flex gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Document
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 select-none">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Posted Revenue (MTD)</span>
            <div className="rounded-full bg-status-posted/10 p-1 text-status-posted">
              <Receipt className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">$138,650.00</span>
            <span className="flex items-center font-mono text-[10px] font-medium text-status-posted">
              <ArrowUpRight className="h-3 w-3" />+12.4%
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">vs. last month same period</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Inventory SKUs</span>
            <div className="rounded-full bg-primary/10 p-1 text-primary">
              <Boxes className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">1,248</span>
            <span className="flex items-center font-mono text-[10px] font-medium text-status-pending">
              <Clock className="h-3 w-3" />12 low stock
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">3 warehouse locations active</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Partners</span>
            <div className="rounded-full bg-primary/10 p-1 text-primary">
              <Users className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">84</span>
            <span className="flex items-center font-mono text-[10px] font-medium text-status-posted">
              <ArrowUpRight className="h-3 w-3" />+4 new
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">62 Customers | 22 Suppliers</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Security Events</span>
            <div className="rounded-full bg-status-rejected/10 p-1 text-status-rejected">
              <AlertCircle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-lg font-bold text-foreground">0</span>
            <span className="flex items-center font-mono text-[10px] font-medium text-status-posted">All Secure</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Last security scan: 4 mins ago</p>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Documents table */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h2 className="text-sm font-bold tracking-tight text-foreground font-sans">Recent Documents & Entries</h2>
            <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground px-1.5 py-0 border-border">
              <TrendingUp className="h-2.5 w-2.5 mr-1" />
              Live
            </Badge>
          </div>
          <DataTable
            columns={columns}
            data={mockDocuments}
            searchColumn="docNumber"
            searchPlaceholder="Filter by doc number..."
          />
        </div>

        {/* Audit trail */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <h2 className="text-sm font-bold tracking-tight text-foreground font-sans">Security Audit Trail</h2>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-primary hover:bg-muted font-semibold px-2">
              View All
            </Button>
          </div>
          <div className="rounded-md border border-border bg-card p-3 space-y-3 select-none">
            {[
              { icon: FileCheck2, color: 'text-status-posted', bg: 'bg-status-posted/10', title: 'Document Posted', time: '14:15', detail: 'INV-2026-0001 posted by admin@xtechs.local' },
              { icon: Clock, color: 'text-status-pending', bg: 'bg-status-pending/10', title: 'Approval Requested', time: '11:04', detail: 'PO-2026-0042 moved to PENDING_APPROVAL' },
              { icon: Users, color: 'text-primary', bg: 'bg-primary/10', title: 'Metadata Cache Refreshed', time: '09:30', detail: 'Global layout config version 1.4.2 loaded' },
              { icon: FileCheck2, color: 'text-status-posted', bg: 'bg-status-posted/10', title: 'Business Scope Switch', time: '08:45', detail: 'Scoped DB initialized for branch HQ Main' },
            ].map((item, i) => (
              <div key={i} className={`flex items-start gap-2 ${i < 3 ? 'border-b border-border/40 pb-2' : ''}`}>
                <div className={`mt-0.5 rounded-full ${item.bg} p-1 ${item.color} shrink-0`}>
                  <item.icon className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground font-sans">{item.title}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{item.time}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
