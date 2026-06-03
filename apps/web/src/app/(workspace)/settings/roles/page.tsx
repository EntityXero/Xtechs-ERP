'use client';

import * as React from 'react';
import { Shield, Plus, Loader2, AlertCircle, CheckCircle2, Lock, Trash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useRoles,
  useCreateRole,
  usePermissions,
  useRolePermissions,
  useAssignPermissionToRole,
  useRevokePermissionFromRole,
} from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Standard actions for our permission matrix
const MATRIX_ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'post', 'reverse'];
const MATRIX_RESOURCES = [
  'document',
  'user',
  'role',
  'permission',
  'branch',
  'metadata',
  'accounting',
  'inventory',
  'crm',
  'hr',
  'report',
  'settings',
];

export default function RolesPermissionsPage() {
  const { data: rolesList, isLoading: loadingRoles, error: rolesError, refetch: refetchRoles } = useRoles();
  const { data: allPermissions, isLoading: loadingAllPerms } = usePermissions();

  const [selectedRoleId, setSelectedRoleId] = React.useState<string | null>(null);
  const selectedRole = React.useMemo(() => {
    return rolesList?.find((r) => r.id === selectedRoleId) || null;
  }, [rolesList, selectedRoleId]);

  const { data: rolePermissionsList, isLoading: loadingRolePerms, refetch: refetchRolePerms } = useRolePermissions(selectedRoleId || '');

  const createRoleMutation = useCreateRole();
  const assignPermMutation = useAssignPermissionToRole(selectedRoleId || '');
  const revokePermMutation = useRevokePermissionFromRole(selectedRoleId || '');

  // Modal State
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [roleName, setRoleName] = React.useState('');
  const [roleDesc, setRoleDesc] = React.useState('');
  const [roleErrorMsg, setRoleErrorMsg] = React.useState<string | null>(null);

  // Set default selected role
  React.useEffect(() => {
    if (rolesList && rolesList.length > 0 && !selectedRoleId) {
      setSelectedRoleId(rolesList[0]!.id);
    }
  }, [rolesList, selectedRoleId]);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleErrorMsg(null);

    if (!roleName.trim()) {
      setRoleErrorMsg('Role Name is required');
      return;
    }

    try {
      const newRole = await createRoleMutation.mutateAsync({
        name: roleName,
        description: roleDesc || null,
      });
      setRoleName('');
      setRoleDesc('');
      setRoleModalOpen(false);
      refetchRoles();
      setSelectedRoleId(newRole.id);
    } catch (err: any) {
      setRoleErrorMsg(err?.message || 'Failed to create role');
    }
  };

  // Helper to determine if the role has a permission
  const checkPermissionState = (resource: string, action: string) => {
    if (!rolePermissionsList) return { has: false, permissionId: null };

    // Check if role has wildcard *.*
    const hasWildcard = rolePermissionsList.some((p) => p.resource === '*' && p.action === '*');
    if (hasWildcard) return { has: true, isWildcard: true, permissionId: null };

    const matching = rolePermissionsList.find(
      (p) => p.resource === resource && p.action === action
    );
    return {
      has: !!matching,
      permissionId: matching?.id || null,
    };
  };

  const handleTogglePermission = async (resource: string, action: string, currentState: any) => {
    if (!selectedRoleId || currentState.isWildcard) return;

    if (currentState.has && currentState.permissionId) {
      // Revoke
      try {
        await revokePermMutation.mutateAsync(currentState.permissionId);
        refetchRolePerms();
      } catch (err) {
        alert('Failed to revoke permission');
      }
    } else {
      // Find permission in allPermissions list or create it on the fly in the backend if it doesn't exist
      // Since our server returns static/seeded ones, find matching
      const matching = allPermissions?.find(
        (p) => p.resource === resource && p.action === action
      );

      if (!matching) {
        // If not found in seeded lists, we'll hit the API to create it first, then map it.
        // For simplicity, let's assume we can map it via a route or it's seeded.
        alert(`Permission definition '${resource}:${action}' not seeded in database.`);
        return;
      }

      try {
        await assignPermMutation.mutateAsync(matching.id);
        refetchRolePerms();
      } catch (err) {
        alert('Failed to assign permission');
      }
    }
  };

  return (
    <div className="space-y-8 select-none">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-sans text-foreground font-sans">Roles & Permissions Matrix</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          Define access control layers, check resource boundaries, and assign system actions per role.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left column: Roles List */}
        <div className="lg:col-span-1 border border-border bg-card rounded-md p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
              Available Roles
            </span>
            <Button size="sm" onClick={() => setRoleModalOpen(true)} className="h-6 text-[10px] font-mono px-2 cursor-pointer">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>

          {loadingRoles ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : rolesError ? (
            <p className="text-xs text-destructive font-mono">Failed to load roles</p>
          ) : (
            <div className="flex flex-col gap-1">
              {rolesList?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-sans transition-colors cursor-pointer border ${
                    selectedRoleId === r.id
                      ? 'bg-primary/10 text-primary border-primary/20 font-semibold'
                      : 'hover:bg-muted/50 border-transparent text-foreground'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Permissions Matrix */}
        <div className="lg:col-span-3 border border-border bg-card rounded-md p-6 space-y-4">
          {selectedRole ? (
            <div className="space-y-6">
              {/* Selected Role Meta */}
              <div className="border-b border-border/60 pb-3 flex justify-between items-start">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-foreground font-sans">{selectedRole.name}</h3>
                  <p className="text-xs text-muted-foreground font-sans">
                    {selectedRole.description || 'No description provided.'}
                  </p>
                </div>
                {selectedRole.name === 'Admin' && (
                  <Badge variant="outline" className="text-[9px] font-mono border-amber-500/30 text-amber-500 bg-amber-500/5">
                    WILDCARD SUPERUSER
                  </Badge>
                )}
              </div>

              {/* Permissions Matrix */}
              {loadingRolePerms || loadingAllPerms ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : selectedRole.name === 'Admin' ? (
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-4 flex gap-3 items-start select-none">
                  <Lock className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-amber-500 font-sans">Wildcard Access Active</p>
                    <p className="text-[11px] text-muted-foreground font-sans leading-normal">
                      {"The \"Admin\" role is configured as a system superuser and automatically possesses all permissions (*.*). Granting or revoking individual permissions is disabled for this role."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border bg-card">
                  <Table>
                    <TableHeader className="bg-muted/50 font-mono">
                      <TableRow className="border-b border-border/60 hover:bg-transparent">
                        <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Resource</TableHead>
                        {MATRIX_ACTIONS.map((action) => (
                          <TableHead key={action} className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-2 text-center">
                            {action}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {MATRIX_RESOURCES.map((resource) => (
                        <TableRow key={resource} className="border-b border-border/40 hover:bg-muted/30">
                          <TableCell className="py-2 px-4 text-xs font-mono text-foreground font-bold">{resource}</TableCell>
                          {MATRIX_ACTIONS.map((action) => {
                            const state = checkPermissionState(resource, action);
                            const mutationPending =
                              assignPermMutation.isPending || revokePermMutation.isPending;

                            return (
                              <TableCell key={action} className="py-2 px-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={state.has}
                                  disabled={mutationPending}
                                  onChange={() => handleTogglePermission(resource, action, state)}
                                  className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring bg-background cursor-pointer disabled:opacity-50"
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-muted-foreground font-mono">
              Select a role from the left list to configure system permissions.
            </div>
          )}
        </div>
      </div>

      {/* Dialog: Add Role */}
      <Dialog open={roleModalOpen} onOpenChange={setRoleModalOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-sans font-bold">Add Security Role</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground font-mono">
              Create a new user authorization group for permission mappings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRole} className="space-y-4">
            {roleErrorMsg && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[10px] font-mono text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{roleErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="roleName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Role Name
              </label>
              <Input
                id="roleName"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="e.g. Sales Manager"
                required
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="roleDesc" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Description
              </label>
              <Input
                id="roleDesc"
                value={roleDesc}
                onChange={(e) => setRoleDesc(e.target.value)}
                placeholder="e.g. Manages sales pipelines and document approvals"
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRoleModalOpen(false)} className="text-xs h-8 cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8 cursor-pointer" disabled={createRoleMutation.isPending}>
                {createRoleMutation.isPending ? (
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
