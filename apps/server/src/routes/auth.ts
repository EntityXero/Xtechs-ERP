import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { createDb } from '@xtechs/db';
import { users, branches, userRoles, roles, refreshTokens } from '@xtechs/db/schema';
import {
  loginWithBranchSchema,
  registerUserSchema,
  refreshTokenSchema,
} from '@xtechs/shared';
import type { EnvConfig, TokenScope, UserResponse } from '@xtechs/shared';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  generateRefreshToken,
  parseDuration,
} from '../lib/auth.js';
import {
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../lib/errors.js';
import { logAudit } from '../lib/audit-service.js';

// ─── Helpers ─────────────────────────────────────────────────

/** Strip sensitive fields from a user row */
function toUserResponse(user: {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: Date | null;
}): UserResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

// ─── Route Plugin ────────────────────────────────────────────

interface AuthRouteOptions {
  config: EnvConfig;
}

export async function authRoutes(fastify: FastifyInstance, opts: AuthRouteOptions) {
  const { config } = opts;
  const { db } = createDb(config.DATABASE_URL);

  // ─── POST /api/v1/auth/register ──────────────────────────
  fastify.post('/api/v1/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerUserSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError('Validation failed', flattenZodErrors(body.error));
    }

    const { email, password, displayName, tenantId, businessId, branchId } = body.data;

    // Check if user already exists in this tenant
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), eq(users.tenantId, tenantId)))
      .limit(1);

    if (existing) {
      throw new ConflictError('A user with this email already exists in this tenant');
    }

    // Verify branch exists and belongs to the correct tenant/business
    const [branch] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(
          eq(branches.id, branchId),
          eq(branches.tenantId, tenantId),
          eq(branches.businessId, businessId),
        ),
      )
      .limit(1);

    if (!branch) {
      throw new NotFoundError('Branch', branchId);
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password, config.BCRYPT_ROUNDS);

    const [user] = await db
      .insert(users)
      .values({
        tenantId,
        email,
        passwordHash,
        displayName,
        status: 'active',
      })
      .returning();

    // Audit: user registered
    await logAudit(db, {
      entityType: 'user',
      entityId: user!.id,
      action: 'register',
      actorId: user!.id,
      newValues: { email, displayName, tenantId, businessId, branchId },
      requestId: request.id,
      tenantId,
      businessId,
      branchId,
      ipAddress: request.clientIp,
    });

    return reply.status(201).send({
      user: toUserResponse(user!),
    });
  });

  // ─── POST /api/v1/auth/login ─────────────────────────────
  fastify.post('/api/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginWithBranchSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError('Validation failed', flattenZodErrors(body.error));
    }

    const { email, password, branchId } = body.data;

    // Find user by email (across all tenants — email uniqueness is per-tenant)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Account is suspended or archived');
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Find the user's branches (via userRoles)
    const userBranches = await db
      .select({
        branchId: userRoles.branchId,
        branchName: branches.name,
        businessId: branches.businessId,
        tenantId: branches.tenantId,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(branches, eq(userRoles.branchId, branches.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id));

    if (userBranches.length === 0) {
      throw new UnauthorizedError('User has no branch assignments. Contact your administrator.');
    }

    // Determine which branch to use
    let selectedBranchId: string;

    if (branchId) {
      // User specified a branch — verify they have access
      const hasBranch = userBranches.some((b) => b.branchId === branchId);
      if (!hasBranch) {
        throw new UnauthorizedError('You do not have access to the specified branch');
      }
      selectedBranchId = branchId;
    } else {
      // Auto-select if only one branch
      const uniqueBranches = [...new Set(userBranches.map((b) => b.branchId))];
      if (uniqueBranches.length === 1) {
        selectedBranchId = uniqueBranches[0]!;
      } else {
        // Multiple branches — return the list so frontend can let user pick
        return reply.status(400).send({
          error: 'BRANCH_SELECTION_REQUIRED',
          message: 'User has access to multiple branches. Please specify a branchId.',
          branches: [...new Map(
            userBranches.map((b) => [b.branchId, { id: b.branchId, name: b.branchName }]),
          ).values()],
        });
      }
    }

    // Get branch details + user roles for this branch
    const branchRoles = userBranches.filter((b) => b.branchId === selectedBranchId);
    const selectedBranch = branchRoles[0]!;
    const roleNames = branchRoles.map((b) => b.roleName);

    // Determine token scope — all-branches for admins
    const tokenScope: TokenScope = roleNames.includes('Admin') ? 'all-branches' : 'branch';

    // Sign access token
    const accessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        tenantId: selectedBranch.tenantId,
        businessId: selectedBranch.businessId,
        branchId: selectedBranchId,
        tokenScope,
        roles: roleNames,
      },
      config.JWT_SECRET,
      config.JWT_EXPIRES_IN,
    );

    // Generate + store refresh token
    const refreshTokenValue = generateRefreshToken();
    const refreshExpiresMs = parseDuration(config.JWT_REFRESH_EXPIRES_IN);

    await db.insert(refreshTokens).values({
      userId: user.id,
      token: refreshTokenValue,
      expiresAt: new Date(Date.now() + refreshExpiresMs),
      tenantId: selectedBranch.tenantId,
      businessId: selectedBranch.businessId,
      branchId: selectedBranchId,
    });

    // Update last login timestamp
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Audit: user logged in
    await logAudit(db, {
      entityType: 'user',
      entityId: user.id,
      action: 'login',
      actorId: user.id,
      newValues: { branchId: selectedBranchId, tokenScope },
      requestId: request.id,
      tenantId: selectedBranch.tenantId,
      businessId: selectedBranch.businessId,
      branchId: selectedBranchId,
      ipAddress: request.clientIp,
    });

    return reply.send({
      tokens: {
        accessToken,
        refreshToken: refreshTokenValue,
      },
      user: toUserResponse({ ...user, lastLoginAt: new Date() }),
    });
  });

  // ─── POST /api/v1/auth/refresh ───────────────────────────
  fastify.post('/api/v1/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshTokenSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError('Validation failed', flattenZodErrors(body.error));
    }

    const { refreshToken: tokenValue } = body.data;

    // Find the refresh token
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.token, tokenValue),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Revoke the old refresh token (rotation)
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, storedToken.id));

    // Look up user + roles
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, storedToken.userId))
      .limit(1);

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User account is no longer active');
    }

    // Get roles for this branch
    const branchRoleRows = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          eq(userRoles.userId, user.id),
          eq(userRoles.branchId, storedToken.branchId),
        ),
      );

    const roleNames = branchRoleRows.map((r) => r.roleName);
    const tokenScope: TokenScope = roleNames.includes('Admin') ? 'all-branches' : 'branch';

    // Sign new access token
    const accessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        tenantId: storedToken.tenantId,
        businessId: storedToken.businessId,
        branchId: storedToken.branchId,
        tokenScope,
        roles: roleNames,
      },
      config.JWT_SECRET,
      config.JWT_EXPIRES_IN,
    );

    // Generate new refresh token
    const newRefreshToken = generateRefreshToken();
    const refreshExpiresMs = parseDuration(config.JWT_REFRESH_EXPIRES_IN);

    await db.insert(refreshTokens).values({
      userId: user.id,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + refreshExpiresMs),
      tenantId: storedToken.tenantId,
      businessId: storedToken.businessId,
      branchId: storedToken.branchId,
    });

    return reply.send({
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  });

  // ─── POST /api/v1/auth/logout ────────────────────────────
  fastify.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = refreshTokenSchema.safeParse(request.body);
    if (!body.success) {
      throw new ValidationError('Validation failed', flattenZodErrors(body.error));
    }

    const { refreshToken: tokenValue } = body.data;

    // Revoke the refresh token
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.token, tokenValue),
          isNull(refreshTokens.revokedAt),
        ),
      );

    // Audit: user logged out
    const auth = request.authContext;
    if (auth) {
      await logAudit(db, {
        entityType: 'user',
        entityId: auth.userId,
        action: 'logout',
        actorId: auth.userId,
        requestId: request.id,
        tenantId: auth.scope.tenantId,
        businessId: auth.scope.businessId,
        branchId: auth.scope.branchId,
        ipAddress: request.clientIp,
      });
    }

    return reply.send({ success: true });
  });

  // ─── GET /api/v1/auth/me ─────────────────────────────────
  fastify.get('/api/v1/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.authContext;
    if (!auth) {
      throw new UnauthorizedError();
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    if (!user) {
      throw new NotFoundError('User', auth.userId);
    }

    return reply.send({
      user: toUserResponse(user),
      scope: auth.scope,
      tokenScope: auth.tokenScope,
      roles: auth.roles,
    });
  });
}

// ─── Zod error helper ────────────────────────────────────────

function flattenZodErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): Record<string, string[]> {
  const flat = error.flatten().fieldErrors;
  const result: Record<string, string[]> = {};
  for (const [key, msgs] of Object.entries(flat)) {
    if (msgs && msgs.length > 0) {
      result[key] = msgs;
    }
  }
  return result;
}
