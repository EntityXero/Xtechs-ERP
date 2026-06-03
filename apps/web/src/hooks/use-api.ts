/**
 * TanStack Query hooks for all core ERP entities.
 * All hooks use credentials:include (via api-client) for cookie-based auth.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  docNumber: string;
  documentType: string;
  status: string;
  workflowState: string;
  branchId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentLine {
  id: string;
  documentId: string;
  lineNumber: number;
  description: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  data?: Record<string, any> | null;
  createdAt: string;
}

export interface DocumentLink {
  id: string;
  sourceDocId: string;
  targetDocId: string;
  relationshipType: string;
  createdAt: string;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface DocumentActivity {
  id: string;
  documentId: string;
  actorId: string;
  activityType: string;
  description: string;
  createdAt: string;
}

export interface DocumentAttachment {
  id: string;
  documentId: string;
  uploaderId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  createdAt: string;
}

export interface DetailedDocumentRecord extends DocumentRecord {
  lines: DocumentLine[];
  links: DocumentLink[];
  comments: DocumentComment[];
  activities: DocumentActivity[];
  attachments: DocumentAttachment[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AccountRecord {
  id: string;
  code: string;
  name: string;
  accountType: string;
  parentId: string | null;
  isActive: boolean;
  openingBalance: string;
  createdAt: string;
}

export interface JournalEntryRecord {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string | null;
  status: string;
  isReversal: boolean;
  createdAt: string;
}

export interface InventoryItemRecord {
  id: string;
  itemCode: string;
  name: string;
  itemType: string;
  unit: string;
  status: string;
  currentStock: string;
  reorderLevel: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  ipAddress: string | null;
  createdAt: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

// ─── Documents ────────────────────────────────────────────────

export function useDocuments(documentType: string, page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['documents', documentType, page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<DocumentRecord>>(
        `/api/v1/documents/${documentType}?page=${page}&pageSize=${pageSize}`,
      ),
    enabled: !!documentType,
    staleTime: 30_000,
  });
}

export function useDocument(documentType: string, id: string) {
  return useQuery({
    queryKey: ['document', documentType, id],
    queryFn: () =>
      api.get<{ document: DocumentRecord }>(`/api/v1/documents/${documentType}/${id}`),
    enabled: !!documentType && !!id,
  });
}

export function useDocumentDetails(documentType: string, id: string) {
  return useQuery({
    queryKey: ['document-details', documentType, id],
    queryFn: () =>
      api.get<DetailedDocumentRecord>(`/api/v1/documents/${documentType}/${id}`),
    enabled: !!documentType && !!id,
    staleTime: 5000,
  });
}

export function useCreateDocument(documentType: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      api.post<DetailedDocumentRecord>(`/api/v1/documents/${documentType}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', documentType] });
    },
  });
}

export function useUpdateDocument(documentType: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) =>
      api.patch<DetailedDocumentRecord>(`/api/v1/documents/${documentType}/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-details', documentType, id] });
      queryClient.invalidateQueries({ queryKey: ['documents', documentType] });
    },
  });
}

export function useTransitionDocument(documentType: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (event: string) =>
      api.post<DetailedDocumentRecord>(`/api/v1/documents/${documentType}/${id}/transition`, { event }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-details', documentType, id] });
      queryClient.invalidateQueries({ queryKey: ['documents', documentType] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useAddComment(documentType: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.post<DocumentComment>(`/api/v1/documents/${documentType}/${id}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-details', documentType, id] });
    },
  });
}

export function useUploadAttachment(documentType: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post<DocumentAttachment>(
        `/api/v1/attachments?entityType=document:${documentType}&entityId=${id}`,
        formData,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-details', documentType, id] });
    },
  });
}

export function useDeleteAttachment(documentType: string, documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      api.del<any>(`/api/v1/attachments/${attachmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-details', documentType, documentId] });
    },
  });
}

// ─── Accounting ───────────────────────────────────────────────

export function useAccounts(page = 1, pageSize = 50) {
  return useQuery({
    queryKey: ['accounts', page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<AccountRecord>>(
        `/api/v1/accounting/accounts?page=${page}&pageSize=${pageSize}`,
      ),
    staleTime: 60_000,
  });
}

export function useJournalEntries(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['journal-entries', page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<JournalEntryRecord>>(
        `/api/v1/accounting/journal-entries?page=${page}&pageSize=${pageSize}`,
      ),
    staleTime: 30_000,
  });
}

// ─── Inventory ────────────────────────────────────────────────

export function useInventoryItems(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['inventory-items', page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<InventoryItemRecord>>(
        `/api/v1/inventory/items?page=${page}&pageSize=${pageSize}`,
      ),
    staleTime: 30_000,
  });
}

// ─── Audit Logs ───────────────────────────────────────────────

export function useAuditLogs(
  filters: { entityType?: string; action?: string } = {},
  page = 1,
  pageSize = 30,
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.action) params.set('action', filters.action);

  return useQuery({
    queryKey: ['audit-logs', filters, page, pageSize],
    queryFn: () =>
      api.get<PaginatedResponse<AuditLogRecord>>(`/api/v1/audit/logs?${params.toString()}`),
    staleTime: 15_000,
  });
}

// ─── Settings, User, and Access Control (RBAC) ────────────────

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'archived';
  lastLoginAt: string | null;
  forcePasswordChange: boolean;
  createdAt: string;
  branches: Array<{
    branchId: string;
    branchName: string;
    roleId: string;
    roleName: string;
  }>;
}

export interface BusinessRecord {
  id: string;
  tenantId: string;
  name: string;
  legalName: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface BranchRecord {
  id: string;
  tenantId: string;
  businessId: string;
  name: string;
  code: string;
  isDefault: boolean;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface RoleRecord {
  id: string;
  tenantId: string;
  businessId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface PermissionRecord {
  id: string;
  resource: string;
  action: string;
  effect: 'allow' | 'deny';
  description: string | null;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserRecord[]>('/api/v1/users'),
    staleTime: 30_000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => api.post<any>('/api/v1/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<any>(`/api/v1/users/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useAssignUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleId, branchId }: { id: string; roleId: string; branchId: string }) =>
      api.post<any>(`/api/v1/users/${id}/roles`, { roleId, branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useBusinesses() {
  return useQuery({
    queryKey: ['businesses'],
    queryFn: () => api.get<BusinessRecord[]>('/api/v1/businesses'),
    staleTime: 60_000,
  });
}

export function useCreateBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => api.post<BusinessRecord>('/api/v1/businesses', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<BranchRecord[]>('/api/v1/branches'),
    staleTime: 60_000,
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => api.post<BranchRecord>('/api/v1/branches', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<RoleRecord[]>('/api/v1/roles'),
    staleTime: 60_000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: any) => api.post<RoleRecord>('/api/v1/roles', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermissionRecord[]>('/api/v1/permissions'),
    staleTime: 300_000, // Long cache time for static permission list
  });
}

export function useRolePermissions(roleId: string) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: () => api.get<PermissionRecord[]>(`/api/v1/roles/${roleId}/permissions`),
    enabled: !!roleId,
  });
}

export function useAssignPermissionToRole(roleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissionId: string) =>
      api.post<any>(`/api/v1/roles/${roleId}/permissions`, { permissionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', roleId] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useRevokePermissionFromRole(roleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (permissionId: string) =>
      api.del<any>(`/api/v1/roles/${roleId}/permissions/${permissionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions', roleId] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (payload: any) => api.post<any>('/api/v1/auth/change-password', payload),
  });
}
