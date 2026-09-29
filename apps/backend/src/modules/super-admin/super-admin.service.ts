import { prisma } from '../../config/prisma';
import { hashPassword, verifyPassword } from '../../utils/password';
import { signSuperAdminToken, verifySuperAdminToken } from '../../utils/jwt';

// ===========================================================================
// Super admin auth
// ===========================================================================

export async function superAdminLogin(email: string, password: string) {
  const sa = await prisma.superAdmin.findUnique({ where: { email } });
  if (!sa || !sa.isActive) throw new Error('INVALID_CREDENTIALS');

  const ok = await verifyPassword(password, sa.passwordHash);
  if (!ok) throw new Error('INVALID_CREDENTIALS');

  const payload = {
    sub: sa.id,
    email: sa.email,
    type: 'super_admin' as const,
  };

  return {
    accessToken: signSuperAdminToken(payload),
    superAdmin: { id: sa.id, email: sa.email },
  };
}

// ===========================================================================
// Companies
// ===========================================================================

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createCompanyWithAdmin(input: {
  companyName: string;
  adminEmail: string;
  adminPassword: string;
}) {
  const slug = slugify(input.companyName);

  // Guard: unique slug and unique admin email
  const existingSlug = await prisma.company.findUnique({ where: { slug } });
  if (existingSlug) throw new Error('SLUG_TAKEN');

  const existingUser = await prisma.user.findUnique({
    where: { email: input.adminEmail },
  });
  if (existingUser) throw new Error('ADMIN_EMAIL_TAKEN');

  const adminHash = await hashPassword(input.adminPassword);

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: input.companyName, slug },
    });

    const admin = await tx.user.create({
      data: {
        email: input.adminEmail,
        passwordHash: adminHash,
        role: 'ADMIN',
        companyId: company.id,
      },
    });

    return { company, admin };
  });

  return result;
}

export async function listCompanies() {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          users: true,
          employees: true,
        },
      },
    },
  });
  return companies;
}

export async function getCompanyById(id: string) {
  const company = await prisma.company.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      _count: {
        select: { employees: true, clients: true, payrollRuns: true },
      },
    },
  });
  if (!company) throw new Error('COMPANY_NOT_FOUND');
  return {
    ...company,
    _count: {
      ...company._count,
      devices: 0,
    },
  };
}

export async function updateCompany(
  id: string,
  input: { name?: string; isActive?: boolean },
) {
  const data: any = {};
  if (input.name !== undefined) {
    data.name = input.name;
    // Note: slug stays the same, we don't rewrite it (URLs shouldn't change)
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return prisma.company.update({ where: { id }, data });
}

export async function deleteCompany(id: string) {
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Error('COMPANY_NOT_FOUND');

  return prisma.$transaction(async (tx) => {
    // 1. Delete invoice payments for this company
    await tx.invoicePayment.deleteMany({ where: { companyId: id } });

    // 2. Delete invoice line items
    await tx.taxInvoiceLineItem.deleteMany({
      where: { invoice: { companyId: id } },
    });

    // 3. Delete tax invoices
    await tx.taxInvoice.deleteMany({ where: { companyId: id } });

    // 4. Delete client category rates
    await tx.clientCategoryRate.deleteMany({
      where: { client: { companyId: id } },
    });

    // 5. Delete employee assignments
    await tx.employeeAssignment.deleteMany({
      where: { client: { companyId: id } },
    });

    // 6. Delete clients
    await tx.client.deleteMany({ where: { companyId: id } });

    // 7. Delete payslip line items
    await tx.payslipLineItem.deleteMany({
      where: { payslip: { payrollRun: { companyId: id } } },
    });

    // 8. Delete payslips
    await tx.payslip.deleteMany({
      where: { payrollRun: { companyId: id } },
    });

    // 9. Delete payroll runs
    await tx.payrollRun.deleteMany({ where: { companyId: id } });

    // 10. Delete attendance logs
    await tx.attendanceLog.deleteMany({ where: { companyId: id } });

    // 11. Delete attendance days
    await tx.attendanceDay.deleteMany({ where: { companyId: id } });

    // 12. Delete biometrics & face embeddings
    await tx.biometric.deleteMany({
      where: { employee: { companyId: id } },
    });
    await tx.faceEmbedding.deleteMany({
      where: { employee: { companyId: id } },
    });

    // 13. Disconnect user from employee before deleting users
    await tx.employee.updateMany({
      where: { companyId: id },
      data: { userId: null },
    });

    // 14. Delete employees
    await tx.employee.deleteMany({ where: { companyId: id } });

    // 15. Delete users
    await tx.user.deleteMany({ where: { companyId: id } });

    // 16. Finally delete company record
    return tx.company.delete({ where: { id } });
  });
}

// ===========================================================================
// Company admins (users with role=ADMIN inside a company)
// ===========================================================================

export async function listCompanyAdmins(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, role: 'ADMIN' },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createCompanyAdmin(input: {
  companyId: string;
  email: string;
  password: string;
}) {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
  });
  if (!company) throw new Error('COMPANY_NOT_FOUND');

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error('EMAIL_TAKEN');

  const hash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: hash,
      role: 'ADMIN',
      companyId: input.companyId,
    },
    select: { id: true, email: true, role: true, companyId: true, createdAt: true },
  });
}

export async function deleteUser(userId: string) {
  // Prevent deleting the last admin of a company (safety)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('USER_NOT_FOUND');

  if (user.role === 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: { companyId: user.companyId, role: 'ADMIN', isActive: true },
    });
    if (adminCount <= 1) throw new Error('LAST_ADMIN');
  }

  return prisma.user.delete({ where: { id: userId } });
}

// ===========================================================================
// Stats
// ===========================================================================

export async function getGlobalStats() {
  const [companies, activeCompanies, users, employees, invoices] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { isActive: true } }),
    prisma.user.count(),
    prisma.employee.count(),
    prisma.taxInvoice.count(),
  ]);

  return {
    companies,
    activeCompanies,
    users,
    employees,
    devices: 0,
    invoices,
  };
}