'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, RefreshCw, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useInventoryItems, type InventoryItemRecord } from '@/hooks/use-api';

const columns: ColumnDef<InventoryItemRecord>[] = [
  {
    accessorKey: 'itemCode',
    header: 'Item Code',
    cell: ({ row }) => (
      <span className="font-mono font-bold tracking-tight text-foreground">{row.getValue('itemCode')}</span>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Item Name',
    cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue('name')}</span>,
  },
  {
    accessorKey: 'itemType',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 capitalize">
        {String(row.getValue('itemType')).replace(/_/g, ' ')}
      </Badge>
    ),
  },
  {
    accessorKey: 'unit',
    header: 'Unit',
    cell: ({ row }) => (
      <span className="font-mono text-[11px] text-muted-foreground uppercase">{row.getValue('unit')}</span>
    ),
  },
  {
    accessorKey: 'currentStock',
    header: 'Current Stock',
    cell: ({ row }) => {
      const stock = parseFloat(String(row.getValue('currentStock')));
      const reorder = parseFloat(String((row.original as InventoryItemRecord).reorderLevel ?? '0'));
      const isLow = reorder > 0 && stock <= reorder;
      return (
        <div className="flex items-center gap-1.5 font-mono">
          {isLow && <AlertTriangle className="h-3 w-3 text-status-pending shrink-0" />}
          <span className={isLow ? 'text-status-pending font-semibold' : 'text-foreground'}>
            {stock.toLocaleString()}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'reorderLevel',
    header: 'Reorder At',
    cell: ({ row }) => {
      const val = row.getValue('reorderLevel');
      return val ? (
        <span className="font-mono text-muted-foreground">{parseFloat(String(val)).toLocaleString()}</span>
      ) : (
        <span className="text-[11px] text-muted-foreground italic font-mono">—</span>
      );
    },
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
];

export default function InventoryPage() {
  const { data, isLoading, isError, refetch } = useInventoryItems();

  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const lowStockCount = items.filter((item) => {
    const stock = parseFloat(item.currentStock);
    const reorder = parseFloat(item.reorderLevel ?? '0');
    return reorder > 0 && stock <= reorder;
  }).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Inventory
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {total > 0
              ? `${total.toLocaleString()} items${lowStockCount > 0 ? ` · ${lowStockCount} low stock` : ''}`
              : 'Stock items and SKUs'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lowStockCount > 0 && (
            <Badge variant="outline" className="font-mono text-[10px] gap-1 border-status-pending/50 text-status-pending bg-status-pending/10">
              <AlertTriangle className="h-3 w-3" />
              {lowStockCount} Low Stock
            </Badge>
          )}
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
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2 select-none">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading inventory...</p>
          </div>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Failed to load inventory items.</p>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <DataTable
          columns={columns}
          data={items}
          searchColumn="name"
          searchPlaceholder="Search inventory items..."
        />
      )}
    </div>
  );
}
