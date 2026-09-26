import { prisma } from '../../config/prisma';
import { parsePagination, buildPaginated } from '../../utils/pagination';
import { Prisma } from '@prisma/client';
import { renderPdf } from '../../utils/pdf';
import { sendMail } from '../../utils/email';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { categoryDefaults, EmployeeCategoryKey } from '../../config/employee-categories';

export type EmployeeCategoryInput =
  | 'HOUSEKEEPING'
  | 'SEMI_SKILLED'
  | 'SECURITY_GUARD'
  | 'SUPERVISOR';

export interface CreateEmployeeInput {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address: string;
  fatherName: string;
  category?: EmployeeCategoryInput;
  department?: string;
  designation?: string;
  employmentType?: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
  dateOfJoining: string;
  baseSalary?: number;
  currency?: string;
  userId?: string;
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {
  isActive?: boolean;
  dateOfLeaving?: string | null;
}

export interface ListEmployeesQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  department?: string;
  category?: EmployeeCategoryInput;
  isActive?: boolean | string;
}

export async function createEmployee(companyId: string, input: CreateEmployeeInput) {
  const existing = await prisma.employee.findFirst({
    where: { companyId, employeeCode: input.employeeCode },
  });
  if (existing) throw new Error('EMPLOYEE_CODE_TAKEN');

  return prisma.employee.create({
    data: {
      employeeCode: input.employeeCode,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      address: input.address,
      fatherName: input.fatherName,
      category: input.category ?? 'HOUSEKEEPING',
      department: input.department,
      designation: input.designation,
      employmentType: input.employmentType ?? 'FULL_TIME',
      dateOfJoining: new Date(input.dateOfJoining),
      baseSalary: input.baseSalary,
      currency: input.currency ?? 'INR',
      userId: input.userId,
      companyId,
    },
  });
}

export async function listEmployees(companyId: string, query: ListEmployeesQuery) {
  const { page, pageSize, skip, take } = parsePagination(query);

  const where: Prisma.EmployeeWhereInput = { companyId };

  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: 'insensitive' } },
      { lastName: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
      { employeeCode: { contains: query.search, mode: 'insensitive' } },
      { fatherName: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.department) where.department = query.department;
  if (query.category) where.category = query.category;

  if (query.isActive !== undefined) {
    const b =
      typeof query.isActive === 'boolean'
        ? query.isActive
        : query.isActive === 'true';
    where.isActive = b;
  }

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take,
      orderBy: { employeeCode: 'asc' },
    }),
    prisma.employee.count({ where }),
  ]);

  return buildPaginated(data, total, page, pageSize);
}

export async function getEmployeeById(companyId: string, id: string) {
  return prisma.employee.findFirst({ where: { id, companyId } });
}

export async function updateEmployee(
  companyId: string,
  id: string,
  input: UpdateEmployeeInput,
) {
  const existing = await prisma.employee.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('EMPLOYEE_NOT_FOUND');

  // Q2 policy: existing rows must have address + fatherName before any update
  // is allowed. If they're missing and this request doesn't provide them,
  // reject the update.
  const willHaveAddress =
    input.address !== undefined ? input.address : existing.address;
  const willHaveFatherName =
    input.fatherName !== undefined ? input.fatherName : existing.fatherName;

  if (!willHaveAddress || willHaveAddress.trim().length === 0) {
    throw new Error('ADDRESS_REQUIRED');
  }
  if (!willHaveFatherName || willHaveFatherName.trim().length === 0) {
    throw new Error('FATHER_NAME_REQUIRED');
  }

  if (input.employeeCode && input.employeeCode !== existing.employeeCode) {
    const dup = await prisma.employee.findFirst({
      where: { companyId, employeeCode: input.employeeCode, NOT: { id } },
    });
    if (dup) throw new Error('EMPLOYEE_CODE_TAKEN');
  }

  const data: Prisma.EmployeeUpdateInput = {};

  if (input.employeeCode !== undefined) data.employeeCode = input.employeeCode;
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address;
  if (input.fatherName !== undefined) data.fatherName = input.fatherName;
  if (input.category !== undefined) data.category = input.category;
  if (input.department !== undefined) data.department = input.department;
  if (input.designation !== undefined) data.designation = input.designation;
  if (input.employmentType !== undefined) data.employmentType = input.employmentType;
  if (input.dateOfJoining !== undefined)
    data.dateOfJoining = new Date(input.dateOfJoining);
  if (input.dateOfLeaving !== undefined)
    data.dateOfLeaving = input.dateOfLeaving ? new Date(input.dateOfLeaving) : null;
  if (input.baseSalary !== undefined) data.baseSalary = input.baseSalary;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.userId !== undefined)
    data.user = input.userId
      ? { connect: { id: input.userId } }
      : { disconnect: true };

  return prisma.employee.update({ where: { id }, data });
}

export async function deactivateEmployee(companyId: string, id: string) {
  const existing = await prisma.employee.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('EMPLOYEE_NOT_FOUND');

  return prisma.employee.update({
    where: { id },
    data: { isActive: false, dateOfLeaving: new Date() },
  });
}





// ---------------------------------------------------------------------------
// Joining Letter PDF
// ---------------------------------------------------------------------------

const joiningTemplatePath = path.join(__dirname, 'templates', 'joining-letter.hbs');
const joiningTemplateSource = fs.readFileSync(joiningTemplatePath, 'utf8');
const compiledJoiningTemplate = Handlebars.compile(joiningTemplateSource);

function employmentTypeLabel(t: string): string {
  switch (t) {
    case 'FULL_TIME': return 'Full Time';
    case 'PART_TIME': return 'Part Time';
    case 'CONTRACT': return 'Contract';
    case 'INTERN': return 'Intern';
    default: return t;
  }
}

export async function generateJoiningLetterPdf(companyId: string, employeeId: string) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
  });
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  const { getCompanyForPdf } = await import('../company/company.service');
  const company = await getCompanyForPdf(companyId);

  const category = employee.category as EmployeeCategoryKey;

  const data = {
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeCode: employee.employeeCode,
    fatherName: employee.fatherName ?? '—',
    category: categoryDefaults[category]?.label ?? category,
    department: employee.department ?? '—',
    designation: employee.designation ?? 'Employee',
    employmentType: employmentTypeLabel(employee.employmentType),
    dateOfJoining: employee.dateOfJoining.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    letterDate: new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),

    companyName: company.name,
    companyAddress: company.address,
  };
  const html = compiledJoiningTemplate(data);
  return renderPdf(html, { pageRanges: '1' });
}

// ---------------------------------------------------------------------------
// Email Joining Letter
// ---------------------------------------------------------------------------

export async function sendJoiningLetterEmail(
  companyId: string,
  employeeId: string,
  customRecipient?: string,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
  });
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  const recipient = (customRecipient || employee.email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    throw new Error('RECIPIENT_EMAIL_REQUIRED');
  }

  const { getCompanyForPdf } = await import('../company/company.service');
  const company = await getCompanyForPdf(companyId);

  const pdfBuffer = await generateJoiningLetterPdf(companyId, employeeId);
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const joiningDateFormatted = employee.dateOfJoining.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #1e3a8a; margin: 0 0 6px 0; font-size: 22px;">Welcome to ${company.name || 'our company'}!</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">Official Joining Letter & Onboarding</p>
      </div>

      <p style="font-size: 15px; line-height: 1.5;">Dear <strong>${fullName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        We are thrilled to welcome you to <strong>${company.name || 'the team'}</strong>! 
        Attached to this email is your official Joining Letter. Please review the details below:
      </p>

      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 40%;">Employee Code:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #0f172a;">${employee.employeeCode}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Designation:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #0f172a;">${employee.designation || 'Staff'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Department:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #0f172a;">${employee.department || 'Operations'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Employment Type:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #0f172a;">${employmentTypeLabel(employee.employmentType)}</td>
          </tr>
          <tr style="border-top: 1px solid #f1f5f9;">
            <td style="padding: 8px 0 4px 0; color: #64748b;">Date of Joining:</td>
            <td style="padding: 8px 0 4px 0; font-weight: 600; text-align: right; color: #2563eb;">${joiningDateFormatted}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.6;">
        Your formal joining letter is attached in PDF format. Please retain this document for your personal records.
        If you have any questions or require assistance during your onboarding, please do not hesitate to contact HR.
      </p>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">${company.name}</p>
        <p style="margin: 0 0 6px 0;">${company.address || ''} ${company.email ? `&bull; ${company.email}` : ''}</p>
        <p style="margin: 0; font-style: italic;">CONFIDENTIALITY NOTICE: This transmission is intended solely for the designated recipient. If you have received this message in error, please notify HR immediately.</p>
      </div>
    </div>
  `;

  const filename = `joining-letter-${employee.employeeCode}.pdf`;
  const mailResult = await sendMail({
    to: recipient,
    subject: `Welcome to ${company.name || 'the team'} - Your Joining Letter (${employee.employeeCode})`,
    html,
    fromName: company.name,
    replyTo: company.email || undefined,
    companyId,
    category: 'JOINING_LETTER',
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  return {
    success: true,
    recipient,
    previewUrl: mailResult.previewUrl,
    isTestAccount: mailResult.isTestAccount,
    employee: {
      id: employee.id,
      code: employee.employeeCode,
      name: fullName,
    },
  };
}