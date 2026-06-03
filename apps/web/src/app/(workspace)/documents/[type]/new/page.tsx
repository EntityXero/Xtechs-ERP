'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Building2,
  Calendar,
  Layers,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCreateDocument, useInventoryItems, useAccounts } from '@/hooks/use-api';

interface PageProps {
  params: Promise<{
    type: string;
  }>;
}

interface FormLine {
  id: string; // local temporary ID for React key
  itemId: string | null;
  itemName: string;
  accountCode: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export default function NewDocumentPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const { type } = resolvedParams;

  const createMutation = useCreateDocument(type);

  // Load items and accounts for selectors
  const itemsQuery = useInventoryItems(1, 100);
  const accountsQuery = useAccounts(1, 100);

  const items = itemsQuery.data?.data ?? [];
  const accounts = accountsQuery.data?.data ?? [];

  // Form State
  const [partnerName, setPartnerName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [postingDate, setPostingDate] = React.useState(new Date().toISOString().split('T')[0]!);

  const [lines, setLines] = React.useState<FormLine[]>([
    {
      id: crypto.randomUUID(),
      itemId: '',
      itemName: '',
      accountCode: '',
      description: '',
      quantity: 1,
      unitPrice: 0,
    },
  ]);

  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        itemId: '',
        itemName: '',
        accountCode: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length === 1) return; // Keep at least one line
    setLines(lines.filter((line) => line.id !== id));
  };

  const handleLineChange = (id: string, field: keyof FormLine, value: any) => {
    setLines(
      lines.map((line) => {
        if (line.id !== id) return line;

        const updated = { ...line, [field]: value };

        // Auto-fill unit price if selecting a registered item
        if (field === 'itemId' && value) {
          const matchedItem = items.find((it) => it.id === value);
          if (matchedItem) {
            updated.itemName = matchedItem.name;
            updated.description = `SKU: ${matchedItem.itemCode} - ${matchedItem.name}`;
            updated.unitPrice = 0.0; // Default to 0, user can override
          }
        }

        // Auto-fill description if selecting a chart of accounts
        if (field === 'accountCode' && value) {
          const matchedAcc = accounts.find((acc) => acc.code === value);
          if (matchedAcc) {
            updated.description = `${matchedAcc.code} - ${matchedAcc.name}`;
          }
        }

        return updated;
      }),
    );
  };

  // Calculations
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const tax = subtotal * 0.15; // 15% standard sales tax
  const totalAmount = subtotal + tax;

  const handleSubmit = async (workflowState: 'draft' | 'pending_approval') => {
    setErrorMessage(null);

    if (!partnerName.trim()) {
      setErrorMessage('Partner name is required.');
      return;
    }

    // Validate lines
    const invalidLine = lines.find((l) => !l.description.trim() || l.quantity <= 0);
    if (invalidLine) {
      setErrorMessage('Every line must have a valid description and a positive quantity.');
      return;
    }

    const payload = {
      type,
      status: 'active',
      workflowState,
      data: {
        partnerName: partnerName.trim(),
        notes: notes.trim(),
        postingDate,
        taxRate: 0.15,
      },
      lines: lines.map((line, index) => ({
        lineNumber: index + 1,
        description: line.description.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.quantity * line.unitPrice,
        data: {
          itemId: line.itemId || null,
          itemName: line.itemName || null,
          accountCode: line.accountCode || null,
        },
      })),
      links: [],
    };

    try {
      const created = await createMutation.mutateAsync(payload);
      // Redirect to detail page
      router.push(`/documents/${type}/${created.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create document. Check values and try again.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.back()}
            className="h-7 w-7 border-border hover:bg-muted"
            title="Cancel"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground font-sans">
              Create New {type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase tracking-wider">
              Document creation module
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 select-none">
          <Badge variant="outline" className="font-mono text-[10px] border-border text-muted-foreground">
            DRAFT
          </Badge>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 select-none">
          <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-destructive font-sans">Validation Error</p>
            <p className="text-[11px] text-destructive/80 font-mono mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Main Form Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left main form block */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Metadata Section */}
          <div className="rounded-md border border-border bg-card p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2 select-none">
              Document Header Information
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Partner / Customer Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    required
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    className="pl-8 h-9 text-xs border-border bg-background"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Posting Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="date"
                    required
                    value={postingDate}
                    onChange={(e) => setPostingDate(e.target.value)}
                    className="pl-8 h-9 text-xs border-border bg-background font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Notes & Descriptions
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal memo or additional terms..."
                className="w-full rounded-md border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[60px]"
              />
            </div>
          </div>

          {/* Line items dynamic grid */}
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="border-b border-border/60 bg-muted/30 px-4 py-2 flex items-center justify-between select-none">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Line Items Configuration
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddLine}
                className="h-7 text-[10px] border-border gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Row
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/10 font-mono text-[10px] uppercase text-muted-foreground tracking-wider select-none">
                    <th className="py-2.5 px-4 w-12 text-center">Line</th>
                    <th className="py-2.5 px-2 w-48">Item / Account Reference</th>
                    <th className="py-2.5 px-2">Description</th>
                    <th className="py-2.5 px-2 text-right w-20">Qty</th>
                    <th className="py-2.5 px-2 text-right w-28">Rate ($)</th>
                    <th className="py-2.5 px-2 text-right w-28">Total ($)</th>
                    <th className="py-2.5 px-4 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs">
                  {lines.map((line, index) => (
                    <tr key={line.id} className="hover:bg-muted/10 transition-colors">
                      <td className="py-2.5 px-4 text-center font-mono text-muted-foreground select-none">
                        {index + 1}
                      </td>
                      <td className="py-2.5 px-2">
                        {type === 'journal_entry' ? (
                          <select
                            value={line.accountCode || ''}
                            onChange={(e) => handleLineChange(line.id, 'accountCode', e.target.value)}
                            className="w-full h-8 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                          >
                            <option value="">-- Select Account --</option>
                            {accounts.map((acc) => (
                              <option key={acc.code} value={acc.code}>
                                {acc.code} - {acc.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={line.itemId || ''}
                            onChange={(e) => handleLineChange(line.id, 'itemId', e.target.value)}
                            className="w-full h-8 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                          >
                            <option value="">-- Select Item --</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.itemCode} - {it.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <Input
                          value={line.description}
                          onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                          placeholder="Line item details..."
                          className="h-8 text-xs border-border bg-background"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => handleLineChange(line.id, 'quantity', parseInt(e.target.value) || 0)}
                          className="h-8 text-xs border-border bg-background text-right font-mono px-2"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => handleLineChange(line.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="h-8 text-xs border-border bg-background text-right font-mono px-2"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold text-foreground select-none">
                        {(line.quantity * line.unitPrice).toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        })}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLine(line.id)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded"
                          disabled={lines.length === 1}
                          title="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Sidebar Calculations & Actions */}
        <div className="space-y-6">
          <div className="rounded-md border border-border bg-card p-4 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2 select-none">
              Financial Summary
            </h2>
            <div className="space-y-2 text-xs font-mono select-none">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal:</span>
                <span className="font-semibold">{subtotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground border-b border-border/30 pb-2">
                <span>Tax (15.0%):</span>
                <span className="font-semibold">{tax.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
              <div className="flex justify-between text-foreground text-sm font-bold pt-1">
                <span>Grand Total:</span>
                <span className="text-primary">{totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-4 space-y-3 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-mono border-b border-border/40 pb-2 select-none">
              Actions
            </h2>
            <Button
              className="w-full text-xs font-semibold h-9"
              onClick={() => handleSubmit('pending_approval')}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && createMutation.variables?.workflowState === 'pending_approval' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : null}
              Submit for Approval
            </Button>
            <Button
              variant="secondary"
              className="w-full text-xs font-semibold h-9"
              onClick={() => handleSubmit('draft')}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && createMutation.variables?.workflowState === 'draft' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : null}
              Save as Draft
            </Button>
            <Button
              variant="outline"
              className="w-full text-xs font-semibold h-9 border-border"
              onClick={() => router.back()}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
