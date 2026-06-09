import { z } from 'zod';

export const createReceiverSchema = z.object({
  senderId: z.string().uuid('Invalid sender ID'),
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  phone: z.string().min(10, 'Phone number is required'),
  email: z.string().email().optional().nullable(),
  idType: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  preferredMethod: z.enum(['CASH', 'BANK', 'MOMO']).default('CASH'),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  momoNumber: z.string().optional().nullable(),
  momoProvider: z.string().optional().nullable(),
  relationshipToSender: z.string().optional().nullable(),
});

export const updateReceiverSchema = createReceiverSchema.partial().omit({ senderId: true });

export type CreateReceiverInput = z.infer<typeof createReceiverSchema>;
export type UpdateReceiverInput = z.infer<typeof updateReceiverSchema>;
