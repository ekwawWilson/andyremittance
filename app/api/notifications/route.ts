import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// GET /api/notifications — unread notifications for the user's receiving point
export async function GET(request: NextRequest) {
  try {
    // Use the receiving point id injected by the auth middleware — avoids a DB round-trip
    const receivingPointId = request.headers.get('x-receiving-point-id');
    if (!receivingPointId) {
      return successResponse({ notifications: [] });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        receivingPointId,
        isRead: false,
      },
      select: {
        id: true,
        message: true,
        isRead: true,
        createdAt: true,
        transactionId: true,
        transaction: {
          select: {
            transactionCode: true,
            ghsAmount: true,
            sender: { select: { firstName: true, lastName: true } },
            receiver: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return successResponse({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return errorResponse('Failed to fetch notifications');
  }
}

// POST /api/notifications — mark a notification as read
export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return errorResponse('Notification id is required', 400);

    // Ownership check: the notification must belong to the requesting user's receiving point
    const receivingPointId = request.headers.get('x-receiving-point-id');
    const notification = await prisma.notification.findUnique({ where: { id }, select: { receivingPointId: true } });
    if (!notification || notification.receivingPointId !== receivingPointId) {
      return errorResponse('Notification not found', 404);
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return successResponse({ ok: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return errorResponse('Failed to update notification');
  }
}
