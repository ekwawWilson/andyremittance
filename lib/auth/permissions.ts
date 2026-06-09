// Server-only permission utilities.
// Do NOT import this file from 'use client' components — it pulls in prisma.

import { NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';
import { ALL_PERMISSION_KEYS, ROLE_DEFAULTS, roleHasPermission } from '@/lib/auth/roles';

// ─── User context extracted from middleware-stamped headers ──────────────────

export interface UserContext {
  userId: string;
  userRole: string;
  userEmail: string;
  receivingPointId: string | null;
}

function extractContext(request: NextRequest): UserContext {
  return {
    userId: request.headers.get('x-user-id')!,
    userRole: request.headers.get('x-user-role')!,
    userEmail: request.headers.get('x-user-email')!,
    receivingPointId: request.headers.get('x-receiving-point-id') ?? null,
  };
}

// ─── requirePermission ───────────────────────────────────────────────────────
// Checks role defaults first (no DB hit). Falls back to a single DB query for
// per-user Permission rows only when the role default doesn't cover it.
// SUPER_ADMIN short-circuits immediately.
//
// Usage:
//   const check = await requirePermission(request, 'MANAGE_USERS');
//   if (check.denied) return check.response;
//   const { ctx } = check;  // ctx.userId, ctx.userRole, …

export async function requirePermission(
  request: NextRequest,
  key: string
): Promise<{ denied: true; response: ReturnType<typeof errorResponse> } | { denied: false; ctx: UserContext }> {
  const ctx = extractContext(request);

  if (ctx.userRole === 'SUPER_ADMIN') return { denied: false, ctx };

  if (roleHasPermission(ctx.userRole, key)) return { denied: false, ctx };

  // Per-user grant check
  const grant = await prisma.permission.findFirst({
    where: { userId: ctx.userId, key },
  });

  if (grant) return { denied: false, ctx };

  return { denied: true, response: errorResponse('Insufficient permissions', 403) };
}

// ─── getMergedPermissions ────────────────────────────────────────────────────
// Returns the union of role defaults + per-user Permission rows.
// Used by /api/auth/me to populate the client's permissions array.

export async function getMergedPermissions(userId: string, role: string): Promise<string[]> {
  if (role === 'SUPER_ADMIN') {
    return [...ALL_PERMISSION_KEYS];
  }

  const defaults = ROLE_DEFAULTS[role] ?? [];

  const userPerms = await prisma.permission.findMany({
    where: { userId },
    select: { key: true },
  });

  const merged = new Set<string>(defaults);
  for (const p of userPerms) {
    merged.add(p.key);
  }

  return [...merged];
}

export function getScopedReceivingPointId(
  request: NextRequest,
  requestedReceivingPointId?: string | null
): string | null {
  return request.headers.get('x-receiving-point-id') ?? requestedReceivingPointId ?? null;
}

export function ensureReceivingPointAccess(
  request: NextRequest,
  targetReceivingPointId?: string | null,
  message: string = 'Insufficient permissions for this receiving point'
) {
  const scopedReceivingPointId = request.headers.get('x-receiving-point-id');
  if (scopedReceivingPointId && targetReceivingPointId && scopedReceivingPointId !== targetReceivingPointId) {
    return errorResponse(message, 403);
  }
  return null;
}

export function ensureTellerTillAccess(
  ctx: UserContext,
  account: {
    accountType: string;
    userId?: string | null;
    user?: { receivingPointId?: string | null } | null;
  },
  message: string = 'Insufficient permissions for this teller till'
) {
  if (ctx.userRole === 'TELLER') {
    if (account.accountType !== 'TELLER_TILL' || account.userId !== ctx.userId) {
      return errorResponse(message, 403);
    }
    return null;
  }

  if (account.accountType !== 'TELLER_TILL') {
    return null;
  }

  if (
    ctx.receivingPointId &&
    account.user?.receivingPointId !== ctx.receivingPointId
  ) {
    return errorResponse(message, 403);
  }

  return null;
}
