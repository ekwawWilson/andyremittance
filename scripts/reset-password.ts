/**
 * Password reset utility
 *
 * Usage:
 *   npx tsx scripts/reset-password.ts                     — list all users
 *   npx tsx scripts/reset-password.ts <email> <newpass>   — reset a user's password
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const [, , email, newPassword] = process.argv;

  // ── List mode ────────────────────────────────────────────────
  if (!email) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true },
      orderBy: { role: 'asc' },
    });

    console.log('\nAll users:\n');
    console.log('  ID'.padEnd(8), 'Role'.padEnd(20), 'Name'.padEnd(24), 'Email'.padEnd(36), 'Active');
    console.log('  ' + '─'.repeat(90));
    for (const u of users) {
      console.log(
        `  ${String(u.id).padEnd(6)}`,
        u.role.padEnd(20),
        `${u.firstName} ${u.lastName}`.padEnd(24),
        u.email.padEnd(36),
        u.isActive ? 'Yes' : 'No',
      );
    }
    console.log();
    return;
  }

  // ── Reset mode ───────────────────────────────────────────────
  if (!newPassword) {
    console.error('Usage: npx tsx scripts/reset-password.ts <email> <newpassword>');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { email }, data: { password: hashed } });

  console.log(`\nPassword reset for ${user.firstName} ${user.lastName} (${user.role})\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
