import { z } from 'zod';

export const createTransactionSchema = z.object({
  senderId: z.string().uuid('Invalid sender ID'),
  receiverId: z.string().uuid('Invalid receiver ID'),
  cadAmount: z.number().positive('Amount must be positive'),
  exchangeRateId: z.string().uuid('Invalid exchange rate ID'),
  exchangeRateOverride: z.number().positive('Override rate must be positive').optional(),
  paymentMethod: z.enum(['CASH', 'E_TRANSFER', 'SPLIT']),
  amountPaidCAD: z.number().min(0),
  receivingMode: z.enum(['CASH', 'BANK', 'MOMO']),
  receivingPointId: z.string().uuid('Invalid receiving point ID'),
  transactionDate: z.string(),
  codeType: z.enum(['STANDARD', 'ADDITIONAL']).optional(),
  bankName: z.string().optional(),
  bankAccountNo: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankBranch: z.string().optional(),
  cashPhoneNumber: z.string().optional(),
  cashGhanaCardNumber: z.string().optional(),
  momoNumber: z.string().optional(),
  momoName: z.string().optional(),
  notes: z.string().optional(),
});

export const updateTransactionStatusSchema = z.object({
  status: z.enum(['PENDING', 'SYNCED', 'PAID', 'PARTIAL', 'PARTIAL_PAYMENT', 'CANCELLED']),
  notes: z.string().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionStatusInput = z.infer<typeof updateTransactionStatusSchema>;
