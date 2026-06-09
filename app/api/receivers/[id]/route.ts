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
    const check = await requirePermission(request, 'VIEW_RECEIVERS');
    if (check.denied) return check.response;

    const { id } = await params;

    const receiver = await prisma.receiver.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, phone: true } },
        transactions: {
          include: {
            receivingPoint: { select: { name: true, code: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!receiver) {
      return notFoundResponse('Receiver not found');
    }

    return successResponse(receiver);
  } catch (error) {
    console.error('Get receiver error:', error);
    return errorResponse('Failed to fetch receiver');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'EDIT_RECEIVERS');
    if (check.denied) return check.response;

    const { id } = await params;
    const body = await request.json();

    // Field whitelist — prevents mass-assignment of internal columns
    const allowed = ['senderId', 'firstName', 'lastName', 'phone', 'email', 'idType', 'idNumber', 'preferredMethod', 'bankName', 'bankAccount', 'bankBranch', 'momoNumber', 'momoProvider', 'relationshipToSender', 'isActive'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) { if (k in body) updates[k] = body[k]; }

    const receiver = await prisma.receiver.update({
      where: { id },
      data: updates as Parameters<typeof prisma.receiver.update>[0]['data'],
    });

    return successResponse(receiver, 'Receiver updated successfully');
  } catch (error) {
    console.error('Update receiver error:', error);
    return errorResponse('Failed to update receiver');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requirePermission(request, 'EDIT_RECEIVERS');
    if (check.denied) return check.response;

    const { id } = await params;

    await prisma.receiver.update({
      where: { id },
      data: { isActive: false },
    });

    return successResponse(null, 'Receiver deactivated successfully');
  } catch (error) {
    console.error('Delete receiver error:', error);
    return errorResponse('Failed to deactivate receiver');
  }
}
