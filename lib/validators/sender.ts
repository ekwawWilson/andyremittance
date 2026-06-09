import { z } from 'zod';

export const createSenderSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(10, 'Phone number is required'),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().default('Canada'),
  idType: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  creditLimit: z.number().min(0).default(0),
});

export const updateSenderSchema = createSenderSchema.partial();

export type CreateSenderInput = z.infer<typeof createSenderSchema>;
export type UpdateSenderInput = z.infer<typeof updateSenderSchema>;
