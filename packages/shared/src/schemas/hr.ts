import { z } from 'zod';

export const EMPLOYEE_STATUSES = {
  ACTIVE: 'active',
  TERMINATED: 'terminated',
} as const;

export const EMPLOYEE_STATUS_VALUES = Object.values(EMPLOYEE_STATUSES);

export const LEAVE_TYPES = {
  CASUAL: 'casual',
  SICK: 'sick',
  EARNED: 'earned',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  UNPAID: 'unpaid',
} as const;

export const LEAVE_TYPE_VALUES = Object.values(LEAVE_TYPES);

/**
 * Department Validation Schema
 */
export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

/**
 * Designation Validation Schema
 */
export const createDesignationSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(255).optional().nullable(),
});

export const updateDesignationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(255).optional().nullable(),
});

/**
 * Employee Validation Schema
 */
export const createEmployeeSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional().nullable(),
  dateOfJoining: z.coerce.date(),
  status: z.enum(EMPLOYEE_STATUS_VALUES as [string, ...string[]]).default('active'),
});

export const updateEmployeeSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(),
  designationId: z.string().uuid().optional().nullable(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(50).optional().nullable(),
  dateOfJoining: z.coerce.date().optional(),
  status: z.enum(EMPLOYEE_STATUS_VALUES as [string, ...string[]]).optional(),
});

/**
 * Leave Request Validation Schema
 */
export const createLeaveRequestSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.enum(LEAVE_TYPE_VALUES as [string, ...string[]]),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  reason: z.string().max(255).optional().nullable(),
}).refine(data => data.toDate >= data.fromDate, {
  message: "toDate must be greater than or equal to fromDate",
  path: ["toDate"],
});

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
