/**
 * Multi-tenant migration script.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('');
  console.log('==============================================');
  console.log('  Multi-tenant migration');
  console.log('==============================================');
  console.log('');

  console.log('[1/7] Creating companies + super_admins tables...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS companies (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      "isActive"  BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS super_admins (
      id             TEXT PRIMARY KEY,
      email          TEXT NOT NULL UNIQUE,
      "passwordHash" TEXT NOT NULL,
      "isActive"     BOOLEAN NOT NULL DEFAULT true,
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt"    TIMESTAMP(3) NOT NULL
    );
  `);
  console.log('   OK Tables ready');

  console.log('[2/7] Adding companyId columns...');
  const tables = [
    'users',
    'employees',
    'attendance_logs',
    'attendance_days',
    'devices',
    'payroll_runs',
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "companyId" TEXT;`,
    );
  }
  console.log('   OK Columns added');

  console.log('[3/7] Ensuring Default Company exists...');
  const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';
  await prisma.$executeRawUnsafe(`
    INSERT INTO companies (id, name, slug, "isActive", "updatedAt")
    VALUES ('${DEFAULT_COMPANY_ID}', 'Default Company', 'default', true, NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
  console.log(`   OK Default Company: ${DEFAULT_COMPANY_ID}`);

  console.log('[4/7] Backfilling companyId on all existing rows...');
  for (const t of tables) {
    const res = await prisma.$executeRawUnsafe(
      `UPDATE "${t}" SET "companyId" = '${DEFAULT_COMPANY_ID}' WHERE "companyId" IS NULL;`,
    );
    console.log(`   OK ${t}: ${res} rows updated`);
  }

  console.log('[5/7] Locking down companyId (NOT NULL + index)...');
  for (const t of tables) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${t}" ALTER COLUMN "companyId" SET NOT NULL;`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "${t}_companyId_idx" ON "${t}" ("companyId");`,
    );
    console.log(`   OK ${t} locked`);
  }

  console.log('[6/7] Ensuring super admin exists...');
  const superEmail = process.env.SUPER_ADMIN_EMAIL ?? 'super@attendance.local';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const superHash = await bcrypt.hash(superPassword, 12);
  await prisma.$executeRawUnsafe(
    `INSERT INTO super_admins (id, email, "passwordHash", "isActive", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, true, NOW())
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash";`,
    superEmail,
    superHash,
  );
  console.log(`   OK Super admin: ${superEmail}`);

  console.log('[7/7] Summary:');
  const counts = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM users`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM employees`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM attendance_logs`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM attendance_days`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM devices`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM payroll_runs`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM companies`),
    prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*)::bigint AS c FROM super_admins`),
  ]);
  console.log(`   users:            ${counts[0][0].c}`);
  console.log(`   employees:        ${counts[1][0].c}`);
  console.log(`   attendance_logs:  ${counts[2][0].c}`);
  console.log(`   attendance_days:  ${counts[3][0].c}`);
  console.log(`   devices:          ${counts[4][0].c}`);
  console.log(`   payroll_runs:     ${counts[5][0].c}`);
  console.log(`   companies:        ${counts[6][0].c}`);
  console.log(`   super_admins:     ${counts[7][0].c}`);
  console.log('');
  console.log('==============================================');
  console.log('  Migration complete');
  console.log('==============================================');
  console.log('');
}

main()
  .catch((e) => {
    console.error('');
    console.error('MIGRATION FAILED');
    console.error(e);
    console.error('');
    console.error('The database may be in an inconsistent state.');
    console.error('Restore from backup with:');
    console.error('  Get-Content backups\\db-before-multitenant-*.sql | docker exec -i attendance-postgres psql -U attendance_user -d attendance_db');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
