'use client';

import * as React from 'react';
import { Building2, Plus, Loader2, AlertCircle, CheckCircle2, Milestone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useBusinesses,
  useCreateBusiness,
  useBranches,
  useCreateBranch,
} from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';

export default function OrganizationSettingsPage() {
  const { data: businessesList, isLoading: loadingBiz, error: bizError, refetch: refetchBiz } = useBusinesses();
  const { data: branchesList, isLoading: loadingBranches, error: branchError, refetch: refetchBranches } = useBranches();

  const createBizMutation = useCreateBusiness();
  const createBranchMutation = useCreateBranch();

  // Modal states
  const [bizModalOpen, setBizModalOpen] = React.useState(false);
  const [branchModalOpen, setBranchModalOpen] = React.useState(false);

  // Form states - Business
  const [bizName, setBizName] = React.useState('');
  const [bizLegalName, setBizLegalName] = React.useState('');
  const [bizErrorMsg, setBizErrorMsg] = React.useState<string | null>(null);

  // Form states - Branch
  const [branchName, setBranchName] = React.useState('');
  const [branchCode, setBranchCode] = React.useState('');
  const [branchIsDefault, setBranchIsDefault] = React.useState(false);
  const [branchErrorMsg, setBranchErrorMsg] = React.useState<string | null>(null);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setBizErrorMsg(null);

    if (!bizName.trim()) {
      setBizErrorMsg('Business Name is required');
      return;
    }

    try {
      await createBizMutation.mutateAsync({
        name: bizName,
        legalName: bizLegalName || null,
      });
      setBizName('');
      setBizLegalName('');
      setBizModalOpen(false);
      refetchBiz();
    } catch (err: any) {
      setBizErrorMsg(err?.message || 'Failed to create business');
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBranchErrorMsg(null);

    if (!branchName.trim()) {
      setBranchErrorMsg('Branch Name is required');
      return;
    }

    if (!branchCode.trim()) {
      setBranchErrorMsg('Branch Code is required');
      return;
    }

    if (!/^[A-Z0-9-]+$/.test(branchCode)) {
      setBranchErrorMsg('Branch Code must be uppercase alphanumeric with hyphens (e.g. HQ-01)');
      return;
    }

    try {
      await createBranchMutation.mutateAsync({
        name: branchName,
        code: branchCode.toUpperCase(),
        isDefault: branchIsDefault,
      });
      setBranchName('');
      setBranchCode('');
      setBranchIsDefault(false);
      setBranchModalOpen(false);
      refetchBranches();
    } catch (err: any) {
      setBranchErrorMsg(err?.message || 'Failed to create branch');
    }
  };

  return (
    <div className="space-y-8 select-none">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-sans text-foreground">Organization Management</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          Configure business units and branches within your isolated ERP Tenant context.
        </p>
      </div>

      {/* Section 1: Business Units */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold font-sans text-foreground">Business Units</h2>
          </div>
          <Button size="sm" onClick={() => setBizModalOpen(true)} className="h-7 text-xs font-mono gap-1 cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            Add Business
          </Button>
        </div>

        {loadingBiz ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bizError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Failed to load businesses list</span>
          </div>
        ) : businessesList?.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground font-mono">
            {"No business units configured yet. Click 'Add Business' to create one."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {businessesList?.map((biz) => (
              <div key={biz.id} className="rounded-md border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold font-sans text-foreground">{biz.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Legal Name: {biz.legalName || 'N/A'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[8px] font-mono border-primary/20 text-primary">
                    ACTIVE
                  </Badge>
                </div>
                <div className="pt-2 flex justify-between items-center text-[9px] text-muted-foreground font-mono border-t border-border/40">
                  <span>ID: {biz.id.slice(0, 8)}...</span>
                  <span>Created: {new Date(biz.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Branches */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <Milestone className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold font-sans text-foreground">Branches</h2>
          </div>
          <Button size="sm" onClick={() => setBranchModalOpen(true)} className="h-7 text-xs font-mono gap-1 cursor-pointer">
            <Plus className="h-3.5 w-3.5" />
            Add Branch
          </Button>
        </div>

        {loadingBranches ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : branchError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Failed to load branches list</span>
          </div>
        ) : branchesList?.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground font-mono">
            {"No branches configured for the active business unit. Click 'Add Branch' to create one."}
          </div>
        ) : (
          <div className="rounded-md border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50 font-mono">
                <TableRow className="border-b border-border/60 hover:bg-transparent">
                  <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Code</TableHead>
                  <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Name</TableHead>
                  <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Default Status</TableHead>
                  <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Created Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchesList?.map((branch) => (
                  <TableRow key={branch.id} className="border-b border-border/40 hover:bg-muted/30">
                    <TableCell className="py-2 px-4 text-xs font-mono text-foreground font-bold">{branch.code}</TableCell>
                    <TableCell className="py-2 px-4 text-xs font-sans text-foreground">{branch.name}</TableCell>
                    <TableCell className="py-2 px-4 text-xs">
                      {branch.isDefault ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px] font-mono py-0 px-2 rounded-md">
                          DEFAULT
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-mono">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-4 text-[10px] font-mono text-muted-foreground">
                      {new Date(branch.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog: Add Business */}
      <Dialog open={bizModalOpen} onOpenChange={setBizModalOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-sans font-bold">Add Business Unit</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground font-mono">
              Register a new legal or operational business division in this tenant.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBusiness} className="space-y-4">
            {bizErrorMsg && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[10px] font-mono text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{bizErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="bizName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Business Name
              </label>
              <Input
                id="bizName"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="e.g. Xtechs Retail"
                required
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bizLegalName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Legal Name (Optional)
              </label>
              <Input
                id="bizLegalName"
                value={bizLegalName}
                onChange={(e) => setBizLegalName(e.target.value)}
                placeholder="e.g. Xtechs Retail Ltd."
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setBizModalOpen(false)} className="text-xs h-8 cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8 cursor-pointer" disabled={createBizMutation.isPending}>
                {createBizMutation.isPending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Create'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add Branch */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-sans font-bold">Add Branch Office</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground font-mono">
              Register a new branch or facility. Code must be unique.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBranch} className="space-y-4">
            {branchErrorMsg && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[10px] font-mono text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{branchErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="branchName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Branch Name
              </label>
              <Input
                id="branchName"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. Warehouse B"
                required
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="branchCode" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Branch Code
              </label>
              <Input
                id="branchCode"
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
                placeholder="e.g. WH-B"
                required
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="flex items-center gap-2 select-none py-1">
              <input
                id="branchIsDefault"
                type="checkbox"
                checked={branchIsDefault}
                onChange={(e) => setBranchIsDefault(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring bg-background cursor-pointer"
              />
              <label htmlFor="branchIsDefault" className="text-xs font-mono text-muted-foreground cursor-pointer">
                Set as default branch for this business
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setBranchModalOpen(false)} className="text-xs h-8 cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8 cursor-pointer" disabled={createBranchMutation.isPending}>
                {createBranchMutation.isPending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Create'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
