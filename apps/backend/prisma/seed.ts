import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  console.log('Seeding fresh database...');

  // 1. Ensure Default Company exists
  const company = await prisma.company.upsert({
    where: { id: DEFAULT_COMPANY_ID },
    update: {},
    create: {
      id: DEFAULT_COMPANY_ID,
      name: 'Default Company',
      slug: 'default',
      isActive: true,
      address: '123 Business Park, Sector 5',
      gstin: '08AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      stateCode: '08',
      phone: '+91 98765 43210',
      email: 'contact@company.com',
      bankName: 'HDFC Bank',
      bankAccount: '1234567890',
      bankIfsc: 'HDFC0001234',
      invoicePrefix: 'INV',
    },
  });
  console.log('✓ Default Company ready:', company.name, `(${company.id})`);

  // 2. Platform Super Admin
  const superEmail = process.env.SUPER_ADMIN_EMAIL ?? 'super@attendance.local';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const superHash = await bcrypt.hash(superPassword, 12);
  const superAdmin = await prisma.superAdmin.upsert({
    where: { email: superEmail },
    update: { passwordHash: superHash },
    create: {
      email: superEmail,
      passwordHash: superHash,
      isActive: true,
    },
  });
  console.log('✓ Super Admin ready:', superAdmin.email, '/', superPassword);

  // 3. Company Admin User
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'supersecret123';
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: adminHash, companyId: DEFAULT_COMPANY_ID },
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      role: 'ADMIN',
      companyId: DEFAULT_COMPANY_ID,
    },
  });
  console.log('✓ Company Admin ready:', adminUser.email, '/', adminPassword);

  console.log('Database successfully initialized fresh.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
