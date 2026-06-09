import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const createRateSchema = z.object({
  date: z.string(),
  cadToGhs: z.number().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_EXCHANGE_RATES');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const validatedData = createRateSchema.parse(body);

    // Get user name
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });

    const parsed = new Date(validatedData.date);
    const date = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0));

    // Check if rate already exists for this date
    const existing = await prisma.exchangeRate.findUnique({
      where: { date },
    });

    if (existing) {
      // Update existing rate
      const rate = await prisma.exchangeRate.update({
        where: { date },
        data: {
          cadToGhs: validatedData.cadToGhs,
          setBy: userId,
          setByName: user ? `${user.firstName} ${user.lastName}` : 'Admin',
        },
      });
      return successResponse(rate, 'Exchange rate updated successfully');
    }

    const rate = await prisma.exchangeRate.create({
      data: {
        date,
        cadToGhs: validatedData.cadToGhs,
        setBy: userId,
        setByName: user ? `${user.firstName} ${user.lastName}` : 'Admin',
      },
    });

    return successResponse(rate, 'Exchange rate set successfully');
  } catch (error) {
    console.error('Create exchange rate error:', error);
    const message = error instanceof Error ? error.message : 'Failed to set exchange rate';
    return errorResponse(message);
  }
}

// AUTH: open to all authenticated users
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const where: Prisma.ExchangeRateWhereInput = { isActive: true };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const rates = await prisma.exchangeRate.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    return successResponse(rates);
  } catch (error) {
    console.error('Get exchange rates error:', error);
    return errorResponse('Failed to fetch exchange rates');
  }
}
