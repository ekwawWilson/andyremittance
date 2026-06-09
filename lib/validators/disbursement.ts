import { z } from 'zod';

export const disbursementDetailsSchema = z.object({
  receivingMode: z.enum(['CASH', 'BANK', 'MOMO']),
  bankName: z.string().trim().optional(),
  bankAccountNo: z.string().trim().optional(),
  bankAccountName: z.string().trim().optional(),
  cashPhoneNumber: z.string().trim().optional(),
  cashGhanaCardNumber: z.string().trim().optional(),
  momoNumber: z.string().trim().optional(),
  momoName: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.receivingMode === 'BANK') {
    if (!data.bankName) {
      ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Bank name is required for bank payments' });
    }
    if (!data.bankAccountNo) {
      ctx.addIssue({ code: 'custom', path: ['bankAccountNo'], message: 'Account number is required for bank payments' });
    }
    if (!data.bankAccountName) {
      ctx.addIssue({ code: 'custom', path: ['bankAccountName'], message: 'Account name is required for bank payments' });
    }
  }

  if (data.receivingMode === 'CASH') {
    if (!data.cashGhanaCardNumber) {
      ctx.addIssue({ code: 'custom', path: ['cashGhanaCardNumber'], message: 'Ghana Card number is required for cash payments' });
    }
    if (!data.cashPhoneNumber) {
      ctx.addIssue({ code: 'custom', path: ['cashPhoneNumber'], message: 'Phone number is required for cash payments' });
    }
  }

  if (data.receivingMode === 'MOMO') {
    if (!data.momoNumber) {
      ctx.addIssue({ code: 'custom', path: ['momoNumber'], message: 'MoMo number is required for mobile money payments' });
    }
    if (!data.momoName) {
      ctx.addIssue({ code: 'custom', path: ['momoName'], message: 'MoMo account name is required for mobile money payments' });
    }
  }
});

export const partialDisbursementSchema = disbursementDetailsSchema.extend({
  ghsAmount: z.number().positive(),
  receiverName: z.string().trim().min(1, 'Receiver name is required'),
  receiverPhone: z.string().trim().min(1, 'Receiver phone number is required'),
  notes: z.string().trim().optional(),
});

export type DisbursementDetailsInput = z.infer<typeof disbursementDetailsSchema>;
export type PartialDisbursementInput = z.infer<typeof partialDisbursementSchema>;

export function normalizeDisbursementDetails(input: DisbursementDetailsInput) {
  return {
    receivingMode: input.receivingMode,
    bankName: input.receivingMode === 'BANK' ? input.bankName ?? null : null,
    bankAccountNo: input.receivingMode === 'BANK' ? input.bankAccountNo ?? null : null,
    bankAccountName: input.receivingMode === 'BANK' ? input.bankAccountName ?? null : null,
    cashPhoneNumber: input.receivingMode === 'CASH' ? input.cashPhoneNumber ?? null : null,
    cashGhanaCardNumber: input.receivingMode === 'CASH' ? input.cashGhanaCardNumber ?? null : null,
    momoNumber: input.receivingMode === 'MOMO' ? input.momoNumber ?? null : null,
    momoName: input.receivingMode === 'MOMO' ? input.momoName ?? null : null,
  };
}
