/**
 * Tenant hierarchy types.
 * Every runtime entity in the ERP carries these three IDs for isolation.
 */

export interface TenantScope {
  tenantId: string;
  businessId: string;
  branchId: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Business {
  id: string;
  tenantId: string;
  name: string;
  legalName: string | null;
  status: 'active' | 'suspended' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  id: string;
  tenantId: string;
  businessId: string;
  name: string;
  code: string;
  isDefault: boolean;
  status: 'active' | 'suspended' | 'archived';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
