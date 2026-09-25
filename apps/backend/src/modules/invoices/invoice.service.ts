import { prisma } from '../../config/prisma';
import {
  categoryDefaults,
  EmployeeCategoryKey,
  GST_RATE,
  getCompanyStateCode,
} from '../../config/employee-categories';
import { getCompanyForPdf } from '../company/company.service';
import { renderPdf } from '../../utils/pdf';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

export interface GenerateInvoiceInput {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  gstMode?: 'auto' | 'cgst_sgst' | 'igst';
  notes?: string;
  dueDate?: string;
}

interface ComputedLineItem {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  category: EmployeeCategoryKey;
  hoursWorked: number;
  hourlyRate: number;
  amount: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function computeInvoiceLines(
  companyId: string,
  clientId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<{ lines: ComputedLineItem[]; subtotal: number }> {
  const assignments = await prisma.employeeAssignment.findMany({
    where: {
      clientId,
      client: { companyId },
      isActive: true,
      startDate: { lte: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
    },
  });

  const overrides = await prisma.clientCategoryRate.findMany({
    where: { clientId },
  });
  const overrideMap = new Map(
    overrides.map((o) => [o.category as EmployeeCategoryKey, Number(o.hourlyRate)]),
  );

  const lines: ComputedLineItem[] = [];
  for (const a of assignments) {
    const employee = await prisma.employee.findFirst({
      where: { id: a.employeeId, companyId },
    });
    if (!employee) continue;

    const days = await prisma.attendanceDay.findMany({
      where: {
        employeeId: a.employeeId,
        companyId,
        date: { gte: periodStart, lte: periodEnd },
        status: 'PRESENT',
      },
    });

    const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
    const hoursWorked = round2(totalMinutes / 60);

    if (hoursWorked === 0) continue;

    const category = employee.category as EmployeeCategoryKey;
    const hourlyRate =
      overrideMap.get(category) ?? categoryDefaults[category].perHour;

    const amount = round2(hoursWorked * hourlyRate);

    lines.push({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      category,
      hoursWorked,
      hourlyRate,
      amount,
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, subtotal };
}

export async function generateInvoiceNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const last = await prisma.taxInvoice.findFirst({
    where: { companyId, invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: 'desc' },
    select: { invoiceNumber: true },
  });

  let nextNum = 1;
  if (last) {
    const num = parseInt(last.invoiceNumber.slice(prefix.length), 10);
    if (!isNaN(num)) nextNum = num + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

export async function generateInvoice(companyId: string, input: GenerateInvoiceInput) {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, companyId },
  });
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const { lines, subtotal } = await computeInvoiceLines(
    companyId,
    input.clientId,
    periodStart,
    periodEnd,
  );
  if (lines.length === 0) throw new Error('NO_BILLABLE_HOURS');

  const companyState = getCompanyStateCode();
  const clientState = client.stateCode ?? '';
  let gstMode: 'cgst_sgst' | 'igst';

  if (input.gstMode === 'cgst_sgst' || input.gstMode === 'igst') {
    gstMode = input.gstMode;
  } else {
    gstMode = clientState && clientState === companyState ? 'cgst_sgst' : 'igst';
  }

  const gstAmount = round2((subtotal * GST_RATE) / 100);
  const cgstAmount = gstMode === 'cgst_sgst' ? round2(gstAmount / 2) : 0;
  const sgstAmount = gstMode === 'cgst_sgst' ? round2(gstAmount / 2) : 0;
  const igstAmount = gstMode === 'igst' ? gstAmount : 0;
  const totalAmount = round2(subtotal + gstAmount);

  const invoiceNumber = await generateInvoiceNumber(companyId);

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.taxInvoice.create({
      data: {
        invoiceNumber,
        clientId: input.clientId,
        companyId,
        periodStart,
        periodEnd,
        subtotal,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalAmount,
        status: 'DRAFT',
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes,
      },
    });

    await tx.taxInvoiceLineItem.createMany({
      data: lines.map((l) => ({
        invoiceId: inv.id,
        employeeId: l.employeeId,
        employeeCode: l.employeeCode,
        employeeName: l.employeeName,
        category: l.category,
        hoursWorked: l.hoursWorked,
        hourlyRate: l.hourlyRate,
        amount: l.amount,
      })),
    });

    return inv;
  });

  return invoice;
}

export async function listInvoices(companyId: string, clientId?: string) {
  return prisma.taxInvoice.findMany({
    where: { companyId, ...(clientId ? { clientId } : {}) },
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { id: true, name: true } },
      _count: { select: { lineItems: true } },
    },
  });
}

export async function getInvoiceById(companyId: string, id: string) {
  return prisma.taxInvoice.findFirst({
    where: { id, companyId },
    include: {
      client: true,
      lineItems: {
        orderBy: [{ category: 'asc' }, { employeeCode: 'asc' }],
      },
    },
  });
}

export async function updateInvoiceStatus(
  companyId: string,
  id: string,
  status: 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED',
) {
  const existing = await prisma.taxInvoice.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('INVOICE_NOT_FOUND');

  const data: any = { status };
  if (status === 'PAID') data.paidAt = new Date();

  return prisma.taxInvoice.update({ where: { id }, data });
}

export async function deleteInvoice(companyId: string, id: string) {
  const existing = await prisma.taxInvoice.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('INVOICE_NOT_FOUND');
  return prisma.taxInvoice.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

const invoiceTemplatePath = path.join(__dirname, 'templates', 'invoice.hbs');
const invoiceTemplateSource = fs.readFileSync(invoiceTemplatePath, 'utf8');
const compiledInvoiceTemplate = Handlebars.compile(invoiceTemplateSource);

const annexureTemplatePath = path.join(__dirname, 'templates', 'annexure.hbs');
const annexureTemplateSource = fs.readFileSync(annexureTemplatePath, 'utf8');
const compiledAnnexureTemplate = Handlebars.compile(annexureTemplateSource);

function numberToWordsIndian(num: number): string {
  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  function twoDigits(n: number): string {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  }

  function threeDigits(n: number): string {
    if (n < 100) return twoDigits(n);
    return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
  }

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let result = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;

  if (crore) result += threeDigits(crore) + ' Crore ';
  if (lakh) result += twoDigits(lakh) + ' Lakh ';
  if (thousand) result += twoDigits(thousand) + ' Thousand ';
  if (hundred) result += threeDigits(hundred);

  result = result.trim() + ' Rupees';
  if (paise) result += ' and ' + twoDigits(paise) + ' Paise';
  return result + ' Only';
}

function fmt(n: number | any): string {
  const num = typeof n === 'number' ? n : Number(n);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export async function generateInvoicePdf(companyId: string, invoiceId: string) {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      client: true,
      lineItems: { orderBy: [{ category: 'asc' }, { employeeCode: 'asc' }] },
    },
  });
  if (!invoice) throw new Error('NOT_FOUND');

  // Group line items by category for the summary page
  const categoryMap = new Map<
    EmployeeCategoryKey,
    { hours: number; amount: number; employeeCount: number; codes: string[] }
  >();

  let totalHours = 0;

  for (const li of invoice.lineItems) {
    const cat = li.category as EmployeeCategoryKey;
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { hours: 0, amount: 0, employeeCount: 0, codes: [] });
    }
    const g = categoryMap.get(cat)!;
    g.hours += Number(li.hoursWorked);
    g.amount += Number(li.amount);
    g.employeeCount += 1;
    g.codes.push(li.employeeCode);
    totalHours += Number(li.hoursWorked);
  }

  let idx = 0;
  const categories = Array.from(categoryMap.entries()).map(([cat, g]) => {
    idx += 1;
    // Build a compact range string like "HK-001 to HK-058"
    const codes = [...g.codes].sort();
    const range =
      codes.length > 1
        ? `${codes[0]} to ${codes[codes.length - 1]}`
        : codes[0] ?? '';
    const avgRate = g.hours > 0 ? g.amount / g.hours : 0;

    return {
      index: idx,
      label: categoryDefaults[cat].label,
      employeeCount: g.employeeCount,
      hours: g.hours.toFixed(2),
      avgRate: fmt(avgRate),
      subtotal: fmt(g.amount),
      range,
    };
  });

  const subtotal = Number(invoice.subtotal);
  const cgstAmount = Number(invoice.cgstAmount);
  const sgstAmount = Number(invoice.sgstAmount);
  const igstAmount = Number(invoice.igstAmount);
  const totalAmount = Number(invoice.totalAmount);

  const companyState = getCompanyStateCode();
  const halfGstRate = GST_RATE / 2;

  const company = await getCompanyForPdf(companyId);

  const templateData = {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issuedAt.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
    periodStart: invoice.periodStart.toISOString().slice(0, 10),
    periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
    notes: invoice.notes,

    companyName: company.name,
    companyGstin: company.gstin,
    companyAddress: company.address,
    companyState: company.stateCode ?? companyState,
    companyLogo: company.logoPath,
    clientName: invoice.client.name,
    clientGstin: invoice.client.gstin,
    clientAddress: invoice.client.address,
    clientState: invoice.client.stateCode,
    clientEmail: invoice.client.email,
    clientPhone: invoice.client.phone,

    totalEmployees: invoice.lineItems.length,
    totalHours: totalHours.toFixed(2),
    categoryCount: categories.length,
    categories,

    subtotal: fmt(subtotal),
    cgstAmount: cgstAmount ? fmt(cgstAmount) : null,
    sgstAmount: sgstAmount ? fmt(sgstAmount) : null,
    igstAmount: igstAmount ? fmt(igstAmount) : null,
    gstRate: GST_RATE,
    halfGstRate,
    totalAmount: fmt(totalAmount),
    amountInWords: numberToWordsIndian(totalAmount),

    bankName: company.bankName ?? 'HDFC Bank',
    bankAccount: company.bankAccount ?? '1234567890',
    bankIfsc: company.bankIfsc ?? 'HDFC0001234',
  };

  const html = compiledInvoiceTemplate(templateData);
  return renderPdf(html);
}
export async function generateInvoiceAnnexurePdf(companyId: string, invoiceId: string) {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      client: true,
      lineItems: { orderBy: [{ category: 'asc' }, { employeeCode: 'asc' }] },
    },
  });
  if (!invoice) throw new Error('NOT_FOUND');

  // Group with full employee detail
  const categoryMap = new Map<
    EmployeeCategoryKey,
    {
      label: string;
      hours: number;
      subtotal: number;
      items: {
        index: number;
        employeeCode: string;
        employeeName: string;
        hoursWorked: string;
        hourlyRate: string;
        amount: string;
      }[];
    }
  >();

  let totalHours = 0;
  let counter = 0;

  for (const li of invoice.lineItems) {
    const cat = li.category as EmployeeCategoryKey;
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, {
        label: categoryDefaults[cat].label,
        hours: 0,
        subtotal: 0,
        items: [],
      });
    }
    const group = categoryMap.get(cat)!;
    counter += 1;
    const h = Number(li.hoursWorked);
    const a = Number(li.amount);
    totalHours += h;
    group.hours += h;
    group.subtotal += a;

    group.items.push({
      index: counter,
      employeeCode: li.employeeCode,
      employeeName: li.employeeName,
      hoursWorked: h.toFixed(2),
      hourlyRate: fmt(li.hourlyRate),
      amount: fmt(li.amount),
    });
  }

  const categories = Array.from(categoryMap.values()).map((c) => ({
    ...c,
    employeeCount: c.items.length,
    hours: c.hours.toFixed(2),
    subtotal: fmt(c.subtotal),
  }));
  const company = await getCompanyForPdf(companyId);

  const templateData = {
    invoiceNumber: invoice.invoiceNumber,
    periodStart: invoice.periodStart.toISOString().slice(0, 10),
    periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),

    companyName: company.name,
    clientName: invoice.client.name,

    totalEmployees: invoice.lineItems.length,
    totalHours: totalHours.toFixed(2),
    categoryCount: categories.length,
    subtotal: fmt(Number(invoice.subtotal)),
    categories,
  };

  const html = compiledAnnexureTemplate(templateData);
  return renderPdf(html);
}