import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, errorResponse } from '@/lib/utils/api-response';
import { requirePermission } from '@/lib/auth/permissions';
import prisma from '@/lib/db/prisma';
import { JournalService } from '@/lib/services/journal.service';

export const dynamic = 'force-dynamic';

const EXPENSE_CODES = ['OPEX-GENERAL-CAD', 'OPEX-SALARY-CAD', 'OPEX-BANK-FEE-CAD', 'OPEX-OTHER-CAD'] as const;

const cashMgmtSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CASH_DEPOSIT'),
    amount: z.number().positive(),
    reference: z.string().min(1),
    description: z.string().optional(),
    date: z.string(), // YYYY-MM-DD
  }),
  z.object({
    type: z.literal('BANK_TRANSFER'),
    amount: z.number().positive(),
    reference: z.string().min(1),
    description: z.string().optional(),
    date: z.string(),
  }),
  z.object({
    type: z.literal('OPERATING_EXPENSE'),
    amount: z.number().positive(),
    expenseCode: z.enum(EXPENSE_CODES),
    reference: z.string().min(1),
    description: z.string().optional(),
    date: z.string(),
  }),
]);

const journalService = new JournalService();

// POST /api/sending/cash-management
export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_CASH');
    if (check.denied) return check.response;
    const userId = check.ctx.userId;

    const body = await request.json();
    const data = cashMgmtSchema.parse(body);

    const parsed = new Date(data.date);
    const journalDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));

    let entry;
    let vaultDelta = 0; // positive = cash-in, negative = cash-out

    if (data.type === 'CASH_DEPOSIT') {
      entry = await prisma.$transaction(async (tx) => {
        await tx.ledgerAccount.update({
          where: { accountCode: 'CASH-CAD' },
          data: { balance: { increment: data.amount } },
        });
        return journalService.recordCashDeposit(data.amount, data.reference, userId, journalDate, data.description, tx);
      });
      vaultDelta = data.amount;
    } else if (data.type === 'BANK_TRANSFER') {
      // Verify sufficient cash balance
      const vault = await prisma.ledgerAccount.findUnique({
        where: { accountCode: 'CASH-CAD' },
        select: { balance: true },
      });
      if (!vault) return errorResponse('CASH-CAD account not found', 500);
      if (Number(vault.balance) < data.amount) {
        return errorResponse(
          `Insufficient vault balance. Available: CAD ${Number(vault.balance).toFixed(2)}, Requested: CAD ${data.amount.toFixed(2)}`,
          400
        );
      }

      entry = await prisma.$transaction(async (tx) => {
        await tx.ledgerAccount.update({
          where: { accountCode: 'CASH-CAD' },
          data: { balance: { decrement: data.amount } },
        });
        await tx.ledgerAccount.update({
          where: { accountCode: 'BANK-CLEARING' },
          data: { balance: { increment: data.amount } },
        });
        return journalService.recordBankTransfer(data.amount, data.reference, userId, journalDate, data.description, tx);
      });
      vaultDelta = -data.amount;
    } else {
      // OPERATING_EXPENSE
      const vault = await prisma.ledgerAccount.findUnique({
        where: { accountCode: 'CASH-CAD' },
        select: { balance: true },
      });
      if (!vault) return errorResponse('CASH-CAD account not found', 500);
      if (Number(vault.balance) < data.amount) {
        return errorResponse(
          `Insufficient vault balance. Available: CAD ${Number(vault.balance).toFixed(2)}, Requested: CAD ${data.amount.toFixed(2)}`,
          400
        );
      }

      entry = await prisma.$transaction(async (tx) => {
        await tx.ledgerAccount.update({
          where: { accountCode: 'CASH-CAD' },
          data: { balance: { decrement: data.amount } },
        });
        // Increment expense account balance (debit-nature account)
        const expAcct = await tx.ledgerAccount.findUnique({ where: { accountCode: data.expenseCode } });
        if (expAcct) {
          await tx.ledgerAccount.update({
            where: { accountCode: data.expenseCode },
            data: { balance: { increment: data.amount } },
          });
        }
        return journalService.recordOperatingExpense(data.expenseCode, data.amount, data.reference, userId, journalDate, data.description, tx);
      });
      vaultDelta = -data.amount;
    }

    // Refresh vault balance for response
    const updatedVault = await prisma.ledgerAccount.findUnique({
      where: { accountCode: 'CASH-CAD' },
      select: { balance: true },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: `SENDING_${data.type}`,
        entity: 'JournalEntry',
        entityId: entry.id,
        changes: JSON.parse(JSON.stringify({
          type: data.type,
          amount: data.amount,
          reference: data.reference,
          date: data.date,
          vaultDelta,
          ...( data.type === 'OPERATING_EXPENSE' ? { expenseCode: data.expenseCode } : {} ),
        })),
      },
    });

    return successResponse({
      journal: entry,
      vaultBalance: updatedVault ? Number(updatedVault.balance) : null,
    }, `${data.type.replace(/_/g, ' ').toLowerCase()} recorded successfully`);
  } catch (error) {
    console.error('Sending cash management error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process cash management entry';
    return errorResponse(message);
  }
}

// GET /api/sending/cash-management — vault balance + recent entries
export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission(request, 'MANAGE_CASH');
    if (check.denied) return check.response;

    const { searchParams } = new URL(request.url);
    const page  = parseInt(searchParams.get('page')  || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    const [vault, bankClearing, recentEntries, total] = await Promise.all([
      prisma.ledgerAccount.findUnique({
        where: { accountCode: 'CASH-CAD' },
        select: { balance: true, accountName: true },
      }),
      prisma.ledgerAccount.findUnique({
        where: { accountCode: 'BANK-CLEARING' },
        select: { balance: true, accountName: true },
      }),
      prisma.journalEntry.findMany({
        where: {
          entryType: { in: ['CASH_DEPOSIT', 'BANK_TRANSFER', 'OPERATING_EXPENSE'] },
        },
        include: {
          lines: {
            include: { account: { select: { accountCode: true, accountName: true } } },
          },
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { journalDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.journalEntry.count({
        where: { entryType: { in: ['CASH_DEPOSIT', 'BANK_TRANSFER', 'OPERATING_EXPENSE'] } },
      }),
    ]);

    return successResponse({
      vault: vault ? { balance: Number(vault.balance), accountName: vault.accountName } : null,
      bankClearing: bankClearing ? { balance: Number(bankClearing.balance), accountName: bankClearing.accountName } : null,
      entries: recentEntries,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Sending cash management GET error:', error);
    return errorResponse('Failed to fetch cash management data');
  }
}
