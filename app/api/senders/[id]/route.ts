import { NextRequest } from 'next/server';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'VIEW_SENDERS');
    if (check.denied) return check.response;

    const { id } = await params;

    const sender = await prisma.sender.findUnique({
      where: { id },
      include: {
        receivers: true,
        senderLedger: true,
        transactions: {
          include: {
            receiver: true,
            receivingPoint: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: { select: { transactions: true } },
      },
    });

    if (!sender) {
      return notFoundResponse('Sender not found');
    }

    // Compute rolling volume windows (non-cancelled only)
    const now = new Date();
    const day30 = new Date(now); day30.setDate(now.getDate() - 30);
    const day90 = new Date(now); day90.setDate(now.getDate() - 90);
    const ytdStart = new Date(now.getFullYear(), 0, 1);

    const [vol30, vol90, volYtd] = await Promise.all([
      prisma.transaction.aggregate({
        where: { senderId: id, status: { not: 'CANCELLED' }, transactionDate: { gte: day30 } },
        _sum: { cadAmount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { senderId: id, status: { not: 'CANCELLED' }, transactionDate: { gte: day90 } },
        _sum: { cadAmount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { senderId: id, status: { not: 'CANCELLED' }, transactionDate: { gte: ytdStart } },
        _sum: { cadAmount: true },
        _count: true,
      }),
    ]);

    return successResponse({
      ...sender,
      volume: {
        last30Days: { cadAmount: Number(vol30._sum.cadAmount ?? 0),  count: vol30._count },
        last90Days: { cadAmount: Number(vol90._sum.cadAmount ?? 0),  count: vol90._count },
        ytd:        { cadAmount: Number(volYtd._sum.cadAmount ?? 0), count: volYtd._count },
      },
    });
  } catch (error) {
    console.error('Get sender error:', error);
    return errorResponse('Failed to fetch sender');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'EDIT_SENDERS');
    if (check.denied) return check.response;

    const { id } = await params;
    const body = await request.json();

    // Field whitelist — prevents mass-assignment of internal columns
    const allowed = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'country', 'idType', 'idNumber', 'creditLimit', 'isActive'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) { if (k in body) updates[k] = body[k]; }

    const sender = await prisma.sender.update({
      where: { id },
      data: updates as Parameters<typeof prisma.sender.update>[0]['data'],
    });

    return successResponse(sender, 'Sender updated successfully');
  } catch (error) {
    console.error('Update sender error:', error);
    return errorResponse('Failed to update sender');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'EDIT_SENDERS');
    if (check.denied) return check.response;

    const { id } = await params;

    await prisma.sender.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse(null, 'Sender deactivated successfully');
  } catch (error) {
    console.error('Delete sender error:', error);
    return errorResponse('Failed to deactivate sender');
  }
}
