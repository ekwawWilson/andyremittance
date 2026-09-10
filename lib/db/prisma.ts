import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    // Prisma's default interactive-transaction timeout is 5 s. This database is
    // a pooled Supabase instance in eu-west-1 and a bare `SELECT 1` from Ghana
    // costs ~1.3 s, so any transaction doing more than three sequential queries
    // can exceed it — a teller marking a payment paid was hitting
    // "Transaction not found ... or was obtained before disconnecting" and the
    // whole disbursement rolled back.
    //
    // The work itself is trivial; the time is round trips. Raising the floor
    // costs nothing when a transaction is quick, and the handful of bulk
    // operations still set their own longer timeouts locally.
    transactionOptions: {
      timeout: 30_000,
      maxWait: 10_000,
    },
  });
}

export const prisma = process.env.NODE_ENV === 'production'
  ? (globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient()))
  : createClient();

export default prisma;
