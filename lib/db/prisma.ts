import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = process.env.NODE_ENV === 'production'
  ? (globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient()))
  : createClient();

export default prisma;
