import { z } from 'zod';

/**
 * Password must be 8-128 chars with at least:
 * - 1 uppercase letter
 * - 1 lowercase letter
 * - 1 digit
 * - 1 special character
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Login with optional branch selection.
 * If branchId is omitted, auto-selects the user's only branch (or errors if multiple).
 */
export const loginWithBranchSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  branchId: z.string().uuid().optional(),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  displayName: z.string().min(1).max(255),
  tenantId: z.string().uuid(),
  businessId: z.string().uuid(),
  branchId: z.string().uuid(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().uuid('Invalid refresh token format'),
});

export const createPermissionSchema = z.object({
  resource: z.string().min(1).max(100),
  action: z.string().min(1).max(50),
  effect: z.enum(['allow', 'deny']).default('allow'),
  description: z.string().max(500).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const assignPermissionSchema = z.object({
  permissionId: z.string().uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginWithBranchInput = z.infer<typeof loginWithBranchSchema>;
export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CreatePermissionInput = z.infer<typeof createPermissionSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignPermissionInput = z.infer<typeof assignPermissionSchema>;
