import { NextRequest } from 'next/server';
import { successResponse, errorResponse, notFoundResponse } from '@/lib/utils/api-response';
import prisma from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

// AUTH: open to all authenticated users
export async function GET(request: NextRequest) {
  try {
    // Use the business server date so rate lookups respect the configured sending date,
    // not the wall-clock date (which diverges when the sending admin adjusts the date).
    const config = await prisma.systemConfig.findFirst();
    const businessDateStr = config?.sendingServerDate
      ? new Date(config.sendingServerDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const today = new Date(`${businessDateStr}T00:00:00.000Z`);

    const rate = await prisma.exchangeRate.findUnique({
      where: { date: today },
    });

    if (!rate) {
      // Try to get the most recent rate
      const latestRate = await prisma.exchangeRate.findFirst({
        where: { isActive: true },
        orderBy: { date: 'desc' },
      });

      if (latestRate) {
        return successResponse({
          ...latestRate,
          isLatest: true,
          message: 'No rate set for today, using most recent rate',
        });
      }

      return notFoundResponse('No exchange rate available');
    }

    return successResponse(rate);
  } catch (error) {
    console.error("Get today's rate error:", error);
    return errorResponse('Failed to fetch exchange rate');
  }
}
