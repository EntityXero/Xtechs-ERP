'use client';

import * as React from 'react';
import { Users, Plus, Loader2, AlertCircle, Shield, UserMinus, UserCheck, Key } from 'lucide-react';
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
  useUsers,
  useCreateUser,
  useUpdateUserStatus,
  useAssignUserRole,
  useBranches,
  useRoles,
} from '@/hooks/use-api';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth-store';

export default function UsersSettingsPage() {
  const { data: usersList, isLoading: loadingUsers, error: usersError, refetch: refetchUsers } = useUsers();
  const { data: branchesList, isLoading: loadingBranches } = useBranches();
  const { data: rolesList, isLoading: loadingRoles } = useRoles();

  const createUserMutation = useCreateUser();
  const updateStatusMutation = useUpdateUserStatus();
  const assignRoleMutation = useAssignUserRole();

  const { user: currentUser } = useAuthStore();

  // Modals
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<any | null>(null);

  // Form states - Create User
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [branchId, setBranchId] = React.useState('');
  const [roleId, setRoleId] = React.useState('');
  const [forceReset, setForceReset] = React.useState(true);
  const [createErrorMsg, setCreateErrorMsg] = React.useState<string | null>(null);

  // Form states - Assign Role
  const [assignBranchId, setAssignBranchId] = React.useState('');
  const [assignRoleId, setAssignRoleId] = React.useState('');
  const [assignErrorMsg, setAssignErrorMsg] = React.useState<string | null>(null);

  // Set default form values when modals open
  React.useEffect(() => {
    if (branchesList && branchesList.length > 0 && !branchId) {
      setBranchId(branchesList[0]!.id);
      setAssignBranchId(branchesList[0]!.id);
    }
  }, [branchesList, branchId]);

  React.useEffect(() => {
    if (rolesList && rolesList.length > 0 && !roleId) {
      setRoleId(rolesList[0]!.id);
      setAssignRoleId(rolesList[0]!.id);
    }
  }, [rolesList, roleId]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErrorMsg(null);

    if (!email || !displayName || !password || !branchId || !roleId) {
      setCreateErrorMsg('All fields are required');
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        email,
        displayName,
        password,
        branchId,
        roleId,
        forcePasswordChange: forceReset,
      });

      setEmail('');
      setDisplayName('');
      setPassword('');
      setForceReset(true);
      setCreateModalOpen(false);
      refetchUsers();
    } catch (err: any) {
      setCreateErrorMsg(err?.message || 'Failed to create user');
    }
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignErrorMsg(null);

    if (!selectedUser || !assignBranchId || !assignRoleId) {
      setAssignErrorMsg('Branch and Role selection are required');
      return;
    }

    try {
      await assignRoleMutation.mutateAsync({
        id: selectedUser.id,
        roleId: assignRoleId,
        branchId: assignBranchId,
      });

      setRoleModalOpen(false);
      setSelectedUser(null);
      refetchUsers();
    } catch (err: any) {
      setAssignErrorMsg(err?.message || 'Failed to assign branch role');
    }
  };

  const toggleUserStatus = async (userRecord: any) => {
    const nextStatus = userRecord.status === 'active' ? 'suspended' : 'active';
    try {
      await updateStatusMutation.mutateAsync({
        id: userRecord.id,
        status: nextStatus,
      });
      refetchUsers();
    } catch (err: any) {
      alert(err?.message || 'Failed to update user status');
    }
  };

  return (
    <div className="space-y-8 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold font-sans text-foreground">Users & Identity Management</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Configure system access, active directories, security status, and role mappings for users.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateModalOpen(true)} className="h-8 text-xs font-mono gap-1.5 cursor-pointer">
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      </div>

      {/* Main Grid */}
      {loadingUsers ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : usersError ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Failed to load users list</span>
        </div>
      ) : (
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50 font-mono">
              <TableRow className="border-b border-border/60 hover:bg-transparent">
                <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Display Name</TableHead>
                <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Email</TableHead>
                <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Branch Mappings & Roles</TableHead>
                <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Status</TableHead>
                <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4">Last Login</TableHead>
                <TableHead className="h-8 text-[10px] font-bold uppercase text-muted-foreground py-1 px-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersList?.map((usr) => (
                <TableRow key={usr.id} className="border-b border-border/40 hover:bg-muted/30">
                  <TableCell className="py-3 px-4 text-xs font-medium text-foreground">
                    {usr.displayName}
                    {usr.id === currentUser?.id && (
                      <span className="ml-1 text-[9px] font-mono text-muted-foreground font-normal">(You)</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-xs font-mono text-muted-foreground">{usr.email}</TableCell>
                  <TableCell className="py-3 px-4 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {usr.branches?.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground font-mono">No assignments</span>
                      ) : (
                        usr.branches?.map((b: any, idx: number) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-[9px] font-mono border-border px-1.5 py-0 bg-muted/40 text-foreground"
                          >
                            {b.branchName}: <span className="font-semibold text-primary">{b.roleName}</span>
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      {usr.status === 'active' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px] font-mono py-0 px-2 rounded-md">
                          ACTIVE
                        </Badge>
                      ) : (
                        <Badge className="bg-status-rejected text-status-rejected-foreground border-destructive/20 text-[9px] font-mono py-0 px-2 rounded-md">
                          SUSPENDED
                        </Badge>
                      )}
                      {usr.forcePasswordChange && (
                        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[9px] font-mono py-0 px-2 rounded-md" title="Forced password change active">
                          <Key className="h-2.5 w-2.5 mr-0.5 inline" />
                          RESET
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 px-4 text-[10px] font-mono text-muted-foreground">
                    {usr.lastLoginAt ? new Date(usr.lastLoginAt).toLocaleString() : 'Never'}
                  </TableCell>
                  <TableCell className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={usr.id === currentUser?.id}
                        onClick={() => {
                          setSelectedUser(usr);
                          setRoleModalOpen(true);
                        }}
                        className="h-7 text-[10px] font-mono gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Shield className="h-3 w-3" />
                        Map Role
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={usr.id === currentUser?.id}
                        onClick={() => toggleUserStatus(usr)}
                        className={`h-7 text-[10px] font-mono gap-1 cursor-pointer ${
                          usr.status === 'active'
                            ? 'text-destructive hover:text-destructive hover:bg-destructive/10'
                            : 'text-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10'
                        }`}
                      >
                        {usr.status === 'active' ? (
                          <>
                            <UserMinus className="h-3 w-3" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <UserCheck className="h-3 w-3" />
                            Activate
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog: Create User */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-sans font-bold">Create User Profile</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground font-mono">
              Register a new corporate identity, set default credentials, and configure access levels.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4">
            {createErrorMsg && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[10px] font-mono text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{createErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="userEmail" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Email Address
              </label>
              <Input
                id="userEmail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@xtechs.local"
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="userDisplayName" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Display Name
              </label>
              <Input
                id="userDisplayName"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. John Doe"
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="userPassword" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Temporary Password
              </label>
              <Input
                id="userPassword"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9 text-xs border-border bg-background font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Default Branch
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full h-9 text-xs border border-border bg-background font-mono rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  {branchesList?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                  Initial Role
                </label>
                <select
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  className="w-full h-9 text-xs border border-border bg-background font-mono rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                >
                  {rolesList?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 select-none py-1">
              <input
                id="forceReset"
                type="checkbox"
                checked={forceReset}
                onChange={(e) => setForceReset(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring bg-background cursor-pointer"
              />
              <label htmlFor="forceReset" className="text-xs font-mono text-muted-foreground cursor-pointer">
                Force user to change password on first login
              </label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateModalOpen(false)} className="text-xs h-8 cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8 cursor-pointer" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? (
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

      {/* Dialog: Assign Branch & Role */}
      <Dialog open={roleModalOpen} onOpenChange={(v) => { if (!v) setSelectedUser(null); setRoleModalOpen(v); }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-sans font-bold">Assign Branch Role</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground font-mono">
              Map user {selectedUser?.displayName} to an additional branch and role combination.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignRole} className="space-y-4">
            {assignErrorMsg && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[10px] font-mono text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{assignErrorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Target Branch
              </label>
              <select
                value={assignBranchId}
                onChange={(e) => setAssignBranchId(e.target.value)}
                className="w-full h-9 text-xs border border-border bg-background font-mono rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {branchesList?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Role to Assign
              </label>
              <select
                value={assignRoleId}
                onChange={(e) => setAssignRoleId(e.target.value)}
                className="w-full h-9 text-xs border border-border bg-background font-mono rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {rolesList?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setRoleModalOpen(false); setSelectedUser(null); }} className="text-xs h-8 cursor-pointer">
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs h-8 cursor-pointer" disabled={assignRoleMutation.isPending}>
                {assignRoleMutation.isPending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Assigning...
                  </span>
                ) : (
                  'Assign Mappings'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
