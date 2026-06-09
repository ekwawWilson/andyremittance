import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/audit-log
// Requires SUPER_ADMIN or ADMIN role
// Query params: entity, action, userId, startDate, endDate, page (default 1), limit (default 50)
export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role');
    if (!userRole || !['SUPER_ADMIN', 'ADMIN'].includes(userRole)) {
      return errorResponse('Only Admin or Super Admin can view audit logs', 403);
    }

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity');
    const action = searchParams.get('action');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: Prisma.AuditLogWhereInput = {};

    if (entity) where.entity = entity;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (userId) where.userId = userId;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate) where.timestamp.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return successResponse({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
    return errorResponse('Failed to fetch audit log');
  }
}
