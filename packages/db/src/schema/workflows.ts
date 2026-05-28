import { pgTable, varchar, uuid, timestamp, boolean, index, text } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { documents } from './documents.js';
import { users } from './users.js';

/**
 * Tracks runtime approval requests for documents in transition.
 */
export const workflowApprovals = pgTable('workflow_approvals', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  transitionEvent: varchar('transition_event', { length: 100 }).notNull(), // e.g., 'submit', 'approve'
  requiredRole: varchar('required_role', { length: 100 }), // Role authorized to approve
  assignedUserId: uuid('assigned_user_id').references(() => users.id), // Direct assigned user
  status: varchar('status', { length: 50 }).notNull().default('pending'), // 'pending', 'approved', 'rejected', 'delegated', 'escalated'
  delegatedTo: uuid('delegated_to').references(() => users.id), // If delegated, target user ID
  comments: text('comments'), // Approver comments/justification
  escalationDeadline: timestamp('escalation_deadline', { withTimezone: true }), // Background job check timestamp
  escalatedToRole: varchar('escalated_to_role', { length: 100 }), // Next level role for escalation
  approvedBy: uuid('approved_by').references(() => users.id), // actual user who approved
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  ...timestampColumns(),
}, (table) => [
  index('idx_workflow_approvals_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_workflow_approvals_document').on(table.documentId),
  index('idx_workflow_approvals_status').on(table.status),
  index('idx_workflow_approvals_assigned').on(table.assignedUserId),
  index('idx_workflow_approvals_role').on(table.requiredRole),
  index('idx_workflow_approvals_deadline').on(table.escalationDeadline),
]);

/**
 * Rules for automatic delegation of approvals (e.g., during vacation).
 */
export const workflowDelegations = pgTable('workflow_delegations', {
  ...pkColumn(),
  ...tenantColumns(),
  delegatorId: uuid('delegator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  delegateeId: uuid('delegatee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...timestampColumns(),
}, (table) => [
  index('idx_workflow_delegations_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_workflow_delegations_active').on(table.isActive),
  index('idx_workflow_delegations_dates').on(table.startDate, table.endDate),
]);
