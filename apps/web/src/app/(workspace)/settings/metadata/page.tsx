'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Database,
  RefreshCw,
  Loader2,
  AlertCircle,
  Plus,
  History,
  Code2,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useMetadataDefinitions,
  useCreateMetadataDefinition,
  useMetadataRevisions,
  useCreateMetadataRevision,
  type MetadataDefinitionRecord,
  type MetadataRevisionRecord,
} from '@/hooks/use-api';
import { useAuthStore } from '@/store/auth-store';

// ─── Definitions Table Columns ────────────────────────────────
const getColumns = (onViewRevisions: (record: MetadataDefinitionRecord) => void): ColumnDef<MetadataDefinitionRecord>[] => [
  {
    accessorKey: 'key',
    header: 'Key',
    cell: ({ row }) => (
      <span className="font-mono font-semibold text-foreground text-xs">
        {row.getValue('key')}
      </span>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => <span className="font-medium text-foreground">{row.getValue('name')}</span>,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0">
        {row.getValue('type')}
      </Badge>
    ),
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="text-muted-foreground text-xs block max-w-[250px] truncate">
        {row.getValue('description') ?? '—'}
      </span>
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
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs font-mono border-border gap-1"
        onClick={() => onViewRevisions(row.original)}
      >
        <History className="h-3 w-3" />
        History
      </Button>
    ),
  },
];

export default function MetadataSettingsPage() {
  const { scope } = useAuthStore();
  const { data: definitions, isLoading, isError, refetch } = useMetadataDefinitions();
  const createDefMutation = useCreateMetadataDefinition();

  // Dialog state: Create Definition
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [newKey, setNewKey] = React.useState('');
  const [newName, setNewName] = React.useState('');
  const [newType, setNewType] = React.useState('form');
  const [newDesc, setNewDesc] = React.useState('');

  // Dialog state: Revisions History & Publish Revision
  const [selectedDef, setSelectedDef] = React.useState<MetadataDefinitionRecord | null>(null);
  const [selectedRevision, setSelectedRevision] = React.useState<MetadataRevisionRecord | null>(null);
  const [revisionJson, setRevisionJson] = React.useState('');
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [revScope, setRevScope] = React.useState<'global' | 'tenant' | 'business' | 'branch'>('branch');

  const revisionsQuery = useMetadataRevisions(selectedDef?.key ?? '');
  const publishRevisionMutation = useCreateMetadataRevision(selectedDef?.key ?? '');

  const columns = React.useMemo(() => getColumns((def) => {
    setSelectedDef(def);
    setSelectedRevision(null);
    setRevisionJson('{\n  \n}');
    setJsonError(null);
  }), []);

  // Handle Create Definition Submit
  const handleCreateDef = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey || !newName) return;
    try {
      await createDefMutation.mutateAsync({
        key: newKey,
        name: newName,
        type: newType,
        description: newDesc || null,
      });
      setIsCreateOpen(false);
      setNewKey('');
      setNewName('');
      setNewDesc('');
      refetch();
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Publish Revision Submit
  const handlePublishRevision = async () => {
    if (!selectedDef) return;
    try {
      // Validate JSON
      const parsedPayload = JSON.parse(revisionJson);
      setJsonError(null);

      // Determine scope ids based on dropdown selection
      const tenantId = ['tenant', 'business', 'branch'].includes(revScope) ? scope?.tenantId ?? null : null;
      const businessId = ['business', 'branch'].includes(revScope) ? scope?.businessId ?? null : null;
      const branchId = revScope === 'branch' ? scope?.branchId ?? null : null;

      await publishRevisionMutation.mutateAsync({
        tenantId,
        businessId,
        branchId,
        payload: parsedPayload,
      });

      // Refetch revisions list and clean editor
      revisionsQuery.refetch();
      setRevisionJson('{\n  \n}');
      setSelectedRevision(null);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setJsonError(`Invalid JSON syntax: ${err.message}`);
      } else {
        setJsonError(err instanceof Error ? err.message : 'Failed to publish revision');
      }
    }
  };

  // Populate editor with existing revision payload for editing/viewing
  React.useEffect(() => {
    if (selectedRevision) {
      setRevisionJson(JSON.stringify(selectedRevision.payload, null, 2));
    }
  }, [selectedRevision]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground font-sans flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Metadata Definitions
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Define system models and publish versioned, scoped layout and workflow rules.
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
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Create Definition
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-2 select-none">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-mono">Loading definitions...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Failed to load metadata definitions from the server.</p>
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Data Table */}
      {!isLoading && !isError && (
        <DataTable
          columns={columns}
          data={definitions ?? []}
          searchColumn="key"
          searchPlaceholder="Search definitions by key..."
        />
      )}

      {/* Dialog: Create Definition */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateDef}>
            <DialogHeader>
              <DialogTitle className="text-sm font-bold font-sans">Create Metadata Definition</DialogTitle>
              <DialogDescription className="text-xs font-mono">
                Initialize a model type descriptor. Revisions are added later.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 select-none">
              <div className="grid gap-2">
                <Label htmlFor="key" className="text-xs font-mono">Definition Key (Unique)</Label>
                <Input
                  id="key"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. form.invoice"
                  className="h-8 text-xs font-mono"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-xs font-mono">Definition Name</Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Invoice Form Schema"
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type" className="text-xs font-mono">Type</Label>
                <select
                  id="type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="h-8 rounded border border-border bg-background px-3 py-1 text-xs text-foreground focus:outline-none"
                >
                  <option value="form">Form Schema</option>
                  <option value="field">Field Definitions</option>
                  <option value="workflow">Workflow Configuration</option>
                  <option value="layout">Layout Configuration</option>
                  <option value="numbering">Numbering Rules</option>
                  <option value="report">Report Configuration</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description" className="text-xs font-mono">Description</Label>
                <Textarea
                  id="description"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Summarize the intent of this model definition."
                  className="text-xs resize-none h-20"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={createDefMutation.isPending}>
                {createDefMutation.isPending ? <Loader2 className="h-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Model
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Revision History & Publishing */}
      <Dialog open={!!selectedDef} onOpenChange={(open) => !open && setSelectedDef(null)}>
        <DialogContent className="sm:max-w-[700px] h-[90vh] flex flex-col p-6">
          <DialogHeader className="shrink-0 border-b border-border pb-3">
            <DialogTitle className="text-sm font-bold font-sans flex items-center gap-1.5">
              <Code2 className="h-4 w-4 text-primary" />
              Revisions: {selectedDef?.name}
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Key: {selectedDef?.key} | Type: {selectedDef?.type}
            </DialogDescription>
          </DialogHeader>

          {/* Dialog Main Content Area (Scrollable) */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-5 gap-4 py-4 select-none">
            {/* Sidebar: Revisions list */}
            <div className="md:col-span-2 border-r border-border/60 pr-2 flex flex-col gap-2 overflow-y-auto">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">Revision Trail</h3>
              {revisionsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              ) : revisionsQuery.data?.length === 0 ? (
                <p className="text-[10px] text-muted-foreground font-mono italic p-2 border border-dashed rounded">
                  No revisions published yet.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {revisionsQuery.data?.map((rev) => {
                    const isSelected = selectedRevision?.id === rev.id;
                    let scopeBadge = 'Global';
                    if (rev.branchId) scopeBadge = 'Branch';
                    else if (rev.businessId) scopeBadge = 'Business';
                    else if (rev.tenantId) scopeBadge = 'Tenant';

                    return (
                      <button
                        key={rev.id}
                        type="button"
                        onClick={() => setSelectedRevision(rev)}
                        className={`w-full text-left p-2 rounded border text-xs font-mono transition-colors flex flex-col gap-0.5 cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border hover:bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        <div className="flex justify-between items-center w-full">
                          <span className="font-semibold text-foreground">v{rev.version}</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 uppercase">
                            {scopeBadge}
                          </Badge>
                        </div>
                        <span className="text-[9px] opacity-70">
                          {new Date(rev.createdAt).toLocaleDateString()} {new Date(rev.createdAt).toLocaleTimeString()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Editor Area */}
            <div className="md:col-span-3 flex flex-col gap-3 h-full min-h-0">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  {selectedRevision ? `Inspecting version ${selectedRevision.version}` : 'Editor: Publish New Version'}
                </h3>
                {selectedRevision && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => {
                      setSelectedRevision(null);
                      setRevisionJson('{\n  \n}');
                    }}
                  >
                    Clear Selection
                  </Button>
                )}
              </div>

              {/* Scope selectors for publishing */}
              {!selectedRevision && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="rev-scope" className="text-[10px] font-mono text-muted-foreground">Scoping:</Label>
                  <select
                    id="rev-scope"
                    value={revScope}
                    onChange={(e) => setRevScope(e.target.value as any)}
                    className="h-6 rounded border border-border bg-background px-2 py-0 text-[10px] font-mono text-foreground focus:outline-none"
                  >
                    <option value="branch">Active Branch Scoped</option>
                    <option value="business">Active Business Scoped</option>
                    <option value="tenant">Tenant Scoped</option>
                    <option value="global">Global (All Tenants)</option>
                  </select>
                </div>
              )}

              {/* JSON code block or text editor */}
              <div className="flex-1 min-h-0 flex flex-col">
                <Textarea
                  value={revisionJson}
                  onChange={(e) => !selectedRevision && setRevisionJson(e.target.value)}
                  className="flex-1 font-mono text-[11px] p-3 border border-border bg-card/50 text-foreground rounded focus:outline-none resize-none leading-relaxed h-full overflow-y-auto"
                  placeholder="Enter JSON schema/config payload here..."
                  readOnly={!!selectedRevision}
                />
              </div>

              {jsonError && (
                <div className="text-[10px] text-destructive font-mono border border-destructive/20 bg-destructive/10 px-2.5 py-1.5 rounded flex gap-1 items-start">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{jsonError}</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSelectedDef(null)}
            >
              Close
            </Button>
            {!selectedRevision && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handlePublishRevision}
                disabled={publishRevisionMutation.isPending}
              >
                {publishRevisionMutation.isPending ? (
                  <Loader2 className="h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Publish Version
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
