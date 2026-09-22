import { prisma } from '../../config/prisma';
import fs from 'fs';
import path from 'path';

export interface UpdateCompanyInput {
  name?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  website?: string;
  stateCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  invoicePrefix?: string;
}

export async function getCompany(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });
  if (!company) throw new Error('COMPANY_NOT_FOUND');
  return company;
}

export async function updateCompany(companyId: string, input: UpdateCompanyInput) {
  const existing = await prisma.company.findUnique({ where: { id: companyId } });
  if (!existing) throw new Error('COMPANY_NOT_FOUND');

  const data: any = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.address !== undefined) data.address = input.address;
  if (input.gstin !== undefined) data.gstin = input.gstin;
  if (input.pan !== undefined) data.pan = input.pan;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.website !== undefined) data.website = input.website;
  if (input.stateCode !== undefined) data.stateCode = input.stateCode;
  if (input.bankName !== undefined) data.bankName = input.bankName;
  if (input.bankAccount !== undefined) data.bankAccount = input.bankAccount;
  if (input.bankIfsc !== undefined) data.bankIfsc = input.bankIfsc;
  if (input.invoicePrefix !== undefined) data.invoicePrefix = input.invoicePrefix;

  return prisma.company.update({ where: { id: companyId }, data });
}

export async function uploadLogo(
  companyId: string,
  buffer: Buffer,
  originalName: string,
) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('COMPANY_NOT_FOUND');

  // Build a stable filename per company (overwrite on re-upload)
  const ext = path.extname(originalName).toLowerCase() || '.png';
  const filename = `${companyId}${ext}`;
  const logosDir = path.join(process.cwd(), 'uploads', 'logos');
  fs.mkdirSync(logosDir, { recursive: true });
  const fullPath = path.join(logosDir, filename);

  // Remove any previous logo with a different extension
  if (company.logoPath && company.logoPath !== `/uploads/logos/${filename}`) {
    const oldFile = path.join(process.cwd(), company.logoPath.replace(/^\//, ''));
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  fs.writeFileSync(fullPath, buffer);

  const logoPath = `/uploads/logos/${filename}`;
  return prisma.company.update({
    where: { id: companyId },
    data: { logoPath },
  });
}

export async function removeLogo(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error('COMPANY_NOT_FOUND');

  if (company.logoPath) {
    const oldFile = path.join(process.cwd(), company.logoPath.replace(/^\//, ''));
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  return prisma.company.update({
    where: { id: companyId },
    data: { logoPath: null },
  });
}

/**
 * Fallback helper: read company info for PDF generation with env var fallback.
 */
export async function getCompanyForPdf(companyId: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId } });

  return {
    name: c?.name ?? process.env.COMPANY_NAME ?? 'Your Company Pvt Ltd',
    address:
      c?.address ??
      process.env.COMPANY_ADDRESS ??
      'Mumbai, Maharashtra',
    gstin: c?.gstin ?? process.env.COMPANY_GSTIN ?? null,
    pan: c?.pan ?? null,
    phone: c?.phone ?? null,
    email: c?.email ?? null,
    website: c?.website ?? null,
    stateCode: c?.stateCode ?? process.env.COMPANY_STATE_CODE ?? '27',
    logoPath: c?.logoPath ?? null,
    bankName: c?.bankName ?? process.env.COMPANY_BANK_NAME ?? 'HDFC Bank',
    bankAccount:
      c?.bankAccount ?? process.env.COMPANY_BANK_ACCOUNT ?? '1234567890',
    bankIfsc: c?.bankIfsc ?? process.env.COMPANY_BANK_IFSC ?? 'HDFC0001234',
    invoicePrefix: c?.invoicePrefix ?? 'INV',
  };
}