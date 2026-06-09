import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

const createPointSchema = z.object({
  name: z.string().min(3),
  code: z.string().min(2).max(20),
  address: z.string(),
  city: z.string(),
  country: z.string().default('Ghana'),
  phone: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_RECEIVING_POINTS');
    if (check.denied) return check.response;

    const body = await request.json();
    const validatedData = createPointSchema.parse(body);

    const point = await prisma.receivingPoint.create({
      data: validatedData,
    });

    // Create vault ledger for this point
    await prisma.ledgerAccount.create({
      data: {
        accountType: 'COMPANY_VAULT',
        accountName: `${point.name} Vault`,
        accountCode: `VAULT-${point.code}`,
        receivingPointId: point.id,
        currency: 'GHS',
      },
    });

    return successResponse(point, 'Receiving point created successfully');
  } catch (error) {
    console.error('Create receiving point error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create receiving point';
    return errorResponse(message);
  }
}

// AUTH: open to all authenticated users
export async function GET(request: NextRequest) {
  try {
    const points = await prisma.receivingPoint.findMany({
      where: { isActive: true },
      include: {
        vaultLedger: true,
        users: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return successResponse(points);
  } catch (error) {
    console.error('Get receiving points error:', error);
    return errorResponse('Failed to fetch receiving points');
  }
}
