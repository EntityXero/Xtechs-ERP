import { pgTable, varchar, uuid, timestamp, index } from 'drizzle-orm/pg-core';
import { pkColumn, tenantColumns, timestampColumns } from './_columns.js';
import { documents } from './documents.js';
import { users } from './users.js';

/**
 * Departments Table.
 */
export const departments = pgTable('departments', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  ...timestampColumns(),
}, (table) => [
  index('idx_departments_scope').on(table.tenantId, table.businessId, table.branchId),
]);

/**
 * Designations Table.
 */
export const designations = pgTable('designations', {
  ...pkColumn(),
  ...tenantColumns(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 255 }),
  ...timestampColumns(),
}, (table) => [
  index('idx_designations_scope').on(table.tenantId, table.businessId, table.branchId),
]);

/**
 * Employees Table.
 * Link users to employees optionally.
 */
export const employees = pgTable('employees', {
  ...pkColumn(),
  ...tenantColumns(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // Optional link to system users
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  designationId: uuid('designation_id').references(() => designations.id, { onDelete: 'set null' }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  dateOfJoining: timestamp('date_of_joining', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'), // 'active', 'terminated'
  ...timestampColumns(),
}, (table) => [
  index('idx_employees_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_employees_user').on(table.userId),
]);

/**
 * Leave Requests Table.
 * Visual workflow document tracking leave request and approval.
 */
export const leaveRequests = pgTable('leave_requests', {
  ...pkColumn(),
  ...tenantColumns(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  leaveType: varchar('leave_type', { length: 50 }).notNull(), // 'casual', 'sick', 'earned', etc.
  fromDate: timestamp('from_date', { withTimezone: true }).notNull(),
  toDate: timestamp('to_date', { withTimezone: true }).notNull(),
  reason: varchar('reason', { length: 255 }),
  ...timestampColumns(),
}, (table) => [
  index('idx_leave_requests_scope').on(table.tenantId, table.businessId, table.branchId),
  index('idx_leave_requests_document').on(table.documentId),
  index('idx_leave_requests_employee').on(table.employeeId),
]);
