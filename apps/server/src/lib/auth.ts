import { hash, compare } from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import type { TokenPayload, TokenScope } from '@xtechs/shared';
import { UnauthorizedError } from './errors.js';

// ─── Password Hashing ───────────────────────────────────────

/**
 * Hash a plain-text password using bcryptjs.
 * @param plain - The plain-text password
 * @param rounds - bcrypt cost factor (default 12)
 */
export async function hashPassword(plain: string, rounds = 12): Promise<string> {
  return hash(plain, rounds);
}

/**
 * Verify a plain-text password against a bcrypt hash.
 */
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}

// ─── JWT ─────────────────────────────────────────────────────

/**
 * Sign a JWT access token with the given payload.
 * Uses jose (ESM-native, Web Crypto API compatible).
 */
export async function signAccessToken(
  payload: {
    sub: string;
    email: string;
    tenantId: string;
    businessId: string;
    branchId: string;
    tokenScope: TokenScope;
    roles: string[];
  },
  secret: string,
  expiresIn: string,
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  return new SignJWT({
    email: payload.email,
    tenantId: payload.tenantId,
    businessId: payload.businessId,
    branchId: payload.branchId,
    tokenScope: payload.tokenScope,
    roles: payload.roles,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

/**
 * Verify and decode a JWT access token.
 * Throws UnauthorizedError on invalid/expired token.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<TokenPayload> {
  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, secretKey);

    return {
      sub: payload.sub as string,
      email: payload['email'] as string,
      tenantId: payload['tenantId'] as string,
      businessId: payload['businessId'] as string,
      branchId: payload['branchId'] as string,
      tokenScope: payload['tokenScope'] as TokenScope,
      roles: payload['roles'] as string[],
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

// ─── Refresh Tokens ──────────────────────────────────────────

/**
 * Generate a random refresh token (UUID v4).
 */
export function generateRefreshToken(): string {
  return randomUUID();
}

/**
 * Parse a duration string (e.g. '7d', '15m', '2h') into milliseconds.
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration format: ${duration}`);

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit]!;
}
