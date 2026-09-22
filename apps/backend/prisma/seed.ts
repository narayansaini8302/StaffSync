import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create admin user (idempotent)
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@company.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'supersecret123';

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hash,
        role: 'ADMIN',
      },
    });
    console.log('Created admin:', adminEmail, '/', adminPassword);
  } else {
    console.log('Admin already exists:', adminEmail);
  }

  // 2. Create a demo employee (only if no employees exist)
  const empCount = await prisma.employee.count();
  if (empCount === 0) {
    const emp = await prisma.employee.create({
      data: {
        employeeCode: 'EMP-0001',
        firstName: 'Demo',
        lastName: 'Employee',
        email: 'demo@company.com',
        department: 'Engineering',
        designation: 'Software Engineer',
        employmentType: 'FULL_TIME',
        dateOfJoining: new Date(),
        baseSalary: 30000,
        currency: 'INR',
      },
    });
    console.log('Created demo employee:', emp.employeeCode);

    // Add a sample attendance day for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.attendanceDay.create({
      data: {
        employeeId: emp.id,
        date: today,
        firstIn: new Date(today.getTime() + 9 * 3600 * 1000 + 25 * 60 * 1000),
        lastOut: new Date(today.getTime() + 18 * 3600 * 1000 + 35 * 60 * 1000),
        totalMinutes: 550,
        overtimeMins: 70,
        lateMins: 0,
        status: 'PRESENT',
      },
    });
    console.log('Created demo attendance day');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
