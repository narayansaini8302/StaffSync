import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import {
  categoryDefaults,
  EmployeeCategoryKey,
  GST_RATE,
  getCompanyStateCode,
} from '../../config/employee-categories';
import { getCompanyForPdf } from '../company/company.service';
import { renderPdf } from '../../utils/pdf';
import { sendMail } from '../../utils/email';
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
  invoiceNumber?: string;
}

export interface CreateManualInvoiceInput {
  clientId?: string;
  clientName: string;
  clientAddress?: string;
  clientGstin?: string;
  clientStateCode?: string;
  clientEmail?: string;
  clientPhone?: string;
  invoiceTitle?: string;
  invoiceNumber?: string;
  issuedAt?: string;
  dueDate?: string;
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
  gstMode?: 'auto' | 'cgst_sgst' | 'igst' | 'none';
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount?: number;
    category?: EmployeeCategoryKey;
  }>;
}

export interface RecordInvoicePaymentInput {
  amount: number;
  paymentDate?: string;
  paymentMode?: string;
  reference?: string;
  notes?: string;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number | any): string {
  const num = typeof n === 'number' ? n : Number(n);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberToWordsIndian(num: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertChunk = (n: number): string => {
    let s = '';
    if (n >= 100) {
      s += `${ones[Math.floor(n / 100)]} Hundred `;
      n %= 100;
    }
    if (n >= 20) {
      s += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    }
    if (n > 0) s += `${ones[n]} `;
    return s.trim();
  };

  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const parts: string[] = [];
  const cr = Math.floor(rupees / 10000000);
  const lk = Math.floor((rupees % 10000000) / 100000);
  const th = Math.floor((rupees % 100000) / 1000);
  const rem = rupees % 1000;

  if (cr) parts.push(`${convertChunk(cr)} Crore`);
  if (lk) parts.push(`${convertChunk(lk)} Lakh`);
  if (th) parts.push(`${convertChunk(th)} Thousand`);
  if (rem) parts.push(convertChunk(rem));

  let res = `${parts.join(' ').trim()} Rupees`;
  if (paise) res += ` and ${convertChunk(paise)} Paise`;
  return `${res.trim()} Only`;
}

function resolveInvoiceMeta(inv: {
  invoiceNumber: string;
  notes?: string | null;
  lineItems?: Array<{ employeeId?: string | null; employeeCode?: string }>;
}) {
  const isGeneral =
    inv.invoiceNumber.startsWith('GEN-') ||
    Boolean(inv.notes?.includes('[GENERAL_INVOICE]')) ||
    Boolean(inv.lineItems?.some((l) => !l.employeeId || l.employeeCode?.startsWith('GEN-')));

  let title = isGeneral ? 'GENERAL INVOICE' : 'TAX INVOICE';
  if (inv.notes?.includes('[TITLE:')) {
    const match = inv.notes.match(/\[TITLE:(.*?)\]/);
    if (match?.[1]?.trim()) title = match[1].trim();
  }

  const cleanedNotes = inv.notes
    ? inv.notes.replace(/\[GENERAL_INVOICE\]/g, '').replace(/\[TITLE:.*?\]/g, '').trim() || null
    : null;

  return { isGeneral, title, cleanedNotes };
}

function attachPaymentSummary<T extends { totalAmount: any; paidAmount?: any }>(inv: T) {
  const total = Number(inv.totalAmount);
  const paid = Number(inv.paidAmount ?? 0);
  return {
    ...inv,
    paidAmount: paid,
    pendingAmount: Math.max(0, round2(total - paid)),
  };
}

async function syncPaymentStatus(companyId: string, invoiceId: string) {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, companyId },
  });
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');

  const payments = await prisma.invoicePayment.findMany({
    where: { invoiceId, companyId },
    orderBy: { paymentDate: 'desc' },
  });

  const totalPaid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const invoiceTotal = round2(Number(invoice.totalAmount));

  let status = invoice.status;
  if (totalPaid >= invoiceTotal) {
    status = 'PAID';
  } else if (totalPaid > 0) {
    status = 'PARTIAL';
  } else if (invoice.status === 'PAID' || invoice.status === 'PARTIAL') {
    status = 'SENT';
  }

  const updated = await prisma.taxInvoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: new Prisma.Decimal(totalPaid),
      status,
      paidAt: totalPaid >= invoiceTotal ? (invoice.paidAt ?? new Date()) : null,
    },
    include: {
      client: true,
      lineItems: { orderBy: [{ category: 'asc' }, { employeeCode: 'asc' }] },
      payments: { orderBy: { paymentDate: 'desc' } },
    },
  });

  return {
    ...updated,
    paidAmount: totalPaid,
    pendingAmount: Math.max(0, round2(invoiceTotal - totalPaid)),
  };
}

// ---------------------------------------------------------------------------
// Invoice Computation & Creation
// ---------------------------------------------------------------------------

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

  const overrides = await prisma.clientCategoryRate.findMany({ where: { clientId } });
  const overrideMap = new Map(overrides.map((o) => [o.category as EmployeeCategoryKey, Number(o.hourlyRate)]));

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
        status: { in: ['PRESENT', 'HALF_DAY'] },
      },
    });

    const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
    const hoursWorked = round2(totalMinutes / 60);
    if (hoursWorked === 0) continue;

    const category = employee.category as EmployeeCategoryKey;
    const hourlyRate = overrideMap.get(category) ?? categoryDefaults[category].perHour;
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

export async function generateInvoiceNumber(companyId: string, prefixText = 'INV'): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${prefixText}-${year}-`;

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
  const client = await prisma.client.findFirst({ where: { id: input.clientId, companyId } });
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const { lines, subtotal } = await computeInvoiceLines(companyId, input.clientId, periodStart, periodEnd);
  if (lines.length === 0) throw new Error('NO_BILLABLE_HOURS');

  const companyState = getCompanyStateCode();
  const clientState = client.stateCode ?? '';
  const gstMode = input.gstMode === 'cgst_sgst' || input.gstMode === 'igst'
    ? input.gstMode
    : clientState && clientState === companyState ? 'cgst_sgst' : 'igst';

  const gstAmount = round2((subtotal * GST_RATE) / 100);
  const cgstAmount = gstMode === 'cgst_sgst' ? round2(gstAmount / 2) : 0;
  const sgstAmount = gstMode === 'cgst_sgst' ? round2(gstAmount / 2) : 0;
  const igstAmount = gstMode === 'igst' ? gstAmount : 0;
  const totalAmount = round2(subtotal + gstAmount);

  const invoiceNumber = input.invoiceNumber?.trim() || (await generateInvoiceNumber(companyId, 'INV'));

  return prisma.$transaction(async (tx) => {
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
}

export async function createManualInvoice(companyId: string, input: CreateManualInvoiceInput) {
  if (!input.items || input.items.length === 0) {
    throw new Error('AT_LEAST_ONE_LINE_ITEM_REQUIRED');
  }

  let client = input.clientId
    ? await prisma.client.findFirst({ where: { id: input.clientId, companyId } })
    : null;

  if (!client && input.clientName) {
    client = await prisma.client.findFirst({ where: { name: input.clientName.trim(), companyId } });
    if (!client) {
      client = await prisma.client.create({
        data: {
          companyId,
          name: input.clientName.trim(),
          address: input.clientAddress || 'Address not specified',
          gstin: input.clientGstin || null,
          stateCode: input.clientStateCode || null,
          email: input.clientEmail || null,
          phone: input.clientPhone || null,
        },
      });
    }
  }

  if (!client) throw new Error('CLIENT_REQUIRED');

  const computedItems = input.items.map((it, idx) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    return {
      description: it.description || `Service item #${idx + 1}`,
      quantity: qty,
      rate,
      amount: round2(qty * rate),
      category: it.category || 'HOUSEKEEPING',
    };
  });

  const subtotal = round2(computedItems.reduce((acc, it) => acc + it.amount, 0));
  const companyState = getCompanyStateCode();
  const clientState = input.clientStateCode || client.stateCode || '';
  const rawGstMode = input.gstMode ?? 'auto';
  const resolvedGst = rawGstMode === 'auto'
    ? clientState && clientState === companyState ? 'cgst_sgst' : 'igst'
    : rawGstMode;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (resolvedGst === 'cgst_sgst') {
    const half = round2((subtotal * (GST_RATE / 2)) / 100);
    cgstAmount = half;
    sgstAmount = half;
  } else if (resolvedGst === 'igst') {
    igstAmount = round2((subtotal * GST_RATE) / 100);
  }

  const totalAmount = round2(subtotal + cgstAmount + sgstAmount + igstAmount);
  const invoiceNumber = input.invoiceNumber?.trim() || (await generateInvoiceNumber(companyId, 'GEN'));
  const issuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date();
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const periodStart = input.periodStart ? new Date(input.periodStart) : issuedAt;
  const periodEnd = input.periodEnd ? new Date(input.periodEnd) : issuedAt;

  const titlePrefix = input.invoiceTitle ? `[TITLE:${input.invoiceTitle}]` : '[TITLE:GENERAL INVOICE]';
  const notesWithTag = input.notes
    ? `[GENERAL_INVOICE] ${titlePrefix} ${input.notes}`
    : `[GENERAL_INVOICE] ${titlePrefix} General invoice for professional services rendered.`;

  return prisma.$transaction(async (tx) => {
    const inv = await tx.taxInvoice.create({
      data: {
        invoiceNumber,
        clientId: client.id,
        companyId,
        periodStart,
        periodEnd,
        subtotal,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalAmount,
        status: 'DRAFT',
        issuedAt,
        dueDate,
        notes: notesWithTag,
      },
    });

    await tx.taxInvoiceLineItem.createMany({
      data: computedItems.map((l, idx) => ({
        invoiceId: inv.id,
        employeeId: null,
        employeeCode: `GEN-${idx + 1}`,
        employeeName: l.description,
        category: l.category,
        hoursWorked: l.quantity,
        hourlyRate: l.rate,
        amount: l.amount,
      })),
    });

    return inv;
  });
}

// ---------------------------------------------------------------------------
// Invoice Query & Status Operations
// ---------------------------------------------------------------------------

export async function listInvoices(companyId: string, clientId?: string) {
  const invoices = await prisma.taxInvoice.findMany({
    where: { companyId, ...(clientId ? { clientId } : {}) },
    orderBy: { issuedAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, email: true } },
      payments: { orderBy: { paymentDate: 'desc' } },
      _count: { select: { lineItems: true, payments: true } },
    },
  });

  return invoices.map(attachPaymentSummary);
}

export async function getInvoiceById(companyId: string, id: string) {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id, companyId },
    include: {
      client: true,
      lineItems: { orderBy: [{ category: 'asc' }, { employeeCode: 'asc' }] },
      payments: { orderBy: { paymentDate: 'desc' } },
    },
  });
  if (!invoice) return null;
  return attachPaymentSummary(invoice);
}

export async function recordInvoicePayment(
  companyId: string,
  invoiceId: string,
  input: RecordInvoicePaymentInput,
) {
  const paymentAmount = round2(Number(input.amount));
  if (paymentAmount <= 0) throw new Error('INVALID_PAYMENT_AMOUNT');

  const payment = await prisma.invoicePayment.create({
    data: {
      invoiceId,
      companyId,
      amount: new Prisma.Decimal(paymentAmount),
      paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
      paymentMode: input.paymentMode || 'BANK_TRANSFER',
      reference: input.reference || null,
      notes: input.notes || null,
    },
  });

  const invoice = await syncPaymentStatus(companyId, invoiceId);
  return { payment, invoice };
}

export async function deleteInvoicePayment(
  companyId: string,
  invoiceId: string,
  paymentId: string,
) {
  const payment = await prisma.invoicePayment.findFirst({
    where: { id: paymentId, invoiceId, companyId },
  });
  if (!payment) throw new Error('PAYMENT_NOT_FOUND');

  await prisma.invoicePayment.delete({ where: { id: paymentId } });
  const invoice = await syncPaymentStatus(companyId, invoiceId);
  return { deletedId: paymentId, invoice };
}

export async function updateInvoiceStatus(
  companyId: string,
  id: string,
  status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'CANCELLED',
) {
  const existing = await prisma.taxInvoice.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('INVOICE_NOT_FOUND');

  const data: any = { status };
  if (status === 'PAID') {
    data.paidAt = new Date();
    data.paidAmount = existing.totalAmount;
  }
  return prisma.taxInvoice.update({ where: { id }, data });
}

export async function deleteInvoice(companyId: string, id: string) {
  const existing = await prisma.taxInvoice.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('INVOICE_NOT_FOUND');
  return prisma.taxInvoice.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// PDF & Email Handling
// ---------------------------------------------------------------------------

const invoiceTpl = Handlebars.compile(fs.readFileSync(path.join(__dirname, 'templates', 'invoice.hbs'), 'utf8'));
const annexureTpl = Handlebars.compile(fs.readFileSync(path.join(__dirname, 'templates', 'annexure.hbs'), 'utf8'));

export async function generateInvoicePdf(companyId: string, invoiceId: string) {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: {
      client: true,
      lineItems: { orderBy: [{ category: 'asc' }, { employeeCode: 'asc' }] },
    },
  });
  if (!invoice) throw new Error('NOT_FOUND');

  const categoryMap = new Map<EmployeeCategoryKey, { hours: number; amount: number; count: number; codes: string[] }>();
  let totalHours = 0;

  for (const li of invoice.lineItems) {
    const cat = li.category as EmployeeCategoryKey;
    const g = categoryMap.get(cat) ?? { hours: 0, amount: 0, count: 0, codes: [] };
    const h = Number(li.hoursWorked);
    const a = Number(li.amount);
    g.hours += h;
    g.amount += a;
    g.count += 1;
    g.codes.push(li.employeeCode);
    totalHours += h;
    categoryMap.set(cat, g);
  }

  let idx = 0;
  const categories = Array.from(categoryMap.entries()).map(([cat, g]) => {
    idx++;
    const codes = [...g.codes].sort();
    return {
      index: idx,
      label: categoryDefaults[cat]?.label ?? cat,
      employeeCount: g.count,
      hours: g.hours.toFixed(2),
      avgRate: fmt(g.hours > 0 ? g.amount / g.hours : 0),
      subtotal: fmt(g.amount),
      range: codes.length > 1 ? `${codes[0]} to ${codes[codes.length - 1]}` : codes[0] ?? '',
    };
  });

  const subtotal = Number(invoice.subtotal);
  const cgst = Number(invoice.cgstAmount);
  const sgst = Number(invoice.sgstAmount);
  const igst = Number(invoice.igstAmount);
  const total = Number(invoice.totalAmount);
  const company = await getCompanyForPdf(companyId);
  const meta = resolveInvoiceMeta(invoice);

  const templateData = {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issuedAt.toISOString().slice(0, 10),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
    periodStart: invoice.periodStart ? invoice.periodStart.toISOString().slice(0, 10) : null,
    periodEnd: invoice.periodEnd ? invoice.periodEnd.toISOString().slice(0, 10) : null,
    notes: meta.cleanedNotes,
    isGeneralInvoice: meta.isGeneral,
    invoiceTitle: meta.title,
    totalItems: invoice.lineItems.length,
    invoiceStatus: invoice.status,
    lineItemsList: invoice.lineItems.map((li, i) => ({
      index: i + 1,
      description: li.employeeName,
      quantity: Number(li.hoursWorked),
      rate: fmt(li.hourlyRate),
      amount: fmt(li.amount),
    })),
    companyName: company.name,
    companyGstin: company.gstin,
    companyAddress: company.address,
    companyState: company.stateCode ?? getCompanyStateCode(),
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
    cgstAmount: cgst ? fmt(cgst) : null,
    sgstAmount: sgst ? fmt(sgst) : null,
    igstAmount: igst ? fmt(igst) : null,
    gstRate: GST_RATE,
    halfGstRate: GST_RATE / 2,
    totalAmount: fmt(total),
    amountInWords: numberToWordsIndian(total),
    bankName: company.bankName ?? 'HDFC Bank',
    bankAccount: company.bankAccount ?? '1234567890',
    bankIfsc: company.bankIfsc ?? 'HDFC0001234',
  };

  return renderPdf(invoiceTpl(templateData));
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

  const categoryMap = new Map<EmployeeCategoryKey, any>();
  let totalHours = 0;
  let counter = 0;

  for (const li of invoice.lineItems) {
    const cat = li.category as EmployeeCategoryKey;
    const catConfig = categoryDefaults[cat] ?? { label: 'General Services', perHour: 0 };
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { label: catConfig.label, hours: 0, subtotal: 0, items: [] });
    }
    const group = categoryMap.get(cat)!;
    counter++;
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

  return renderPdf(annexureTpl(templateData));
}

export async function sendInvoiceEmail(
  companyId: string,
  invoiceId: string,
  options?: {
    recipientEmail?: string;
    includeAnnexure?: boolean;
    customMessage?: string;
  },
) {
  const invoice = await prisma.taxInvoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { client: true, lineItems: true },
  });
  if (!invoice) throw new Error('NOT_FOUND');

  const recipient = (options?.recipientEmail || invoice.client.email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    throw new Error('RECIPIENT_EMAIL_REQUIRED');
  }

  const meta = resolveInvoiceMeta(invoice);
  const company = await getCompanyForPdf(companyId);
  const invoicePdf = await generateInvoicePdf(companyId, invoiceId);

  const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [
    {
      filename: `invoice-${invoice.invoiceNumber}.pdf`,
      content: invoicePdf,
      contentType: 'application/pdf',
    },
  ];

  const includeAnnexure = meta.isGeneral ? false : (options?.includeAnnexure ?? true);
  if (includeAnnexure) {
    try {
      const annexurePdf = await generateInvoiceAnnexurePdf(companyId, invoiceId);
      attachments.push({
        filename: `annexure-${invoice.invoiceNumber}.pdf`,
        content: annexurePdf,
        contentType: 'application/pdf',
      });
    } catch (annexureErr) {
      console.warn('[Invoice Email] Annexure PDF skipped:', annexureErr);
    }
  }

  const subtotalFormatted = fmt(Number(invoice.subtotal));
  const totalFormatted = fmt(Number(invoice.totalAmount));
  const cgst = Number(invoice.cgstAmount) > 0 ? fmt(Number(invoice.cgstAmount)) : null;
  const sgst = Number(invoice.sgstAmount) > 0 ? fmt(Number(invoice.sgstAmount)) : null;
  const igst = Number(invoice.igstAmount) > 0 ? fmt(Number(invoice.igstAmount)) : null;

  const issueDateStr = invoice.issuedAt.toISOString().slice(0, 10);
  const dueDateStr = invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : 'Upon Receipt';
  const periodStr = `${invoice.periodStart.toISOString().slice(0, 10)} to ${invoice.periodEnd.toISOString().slice(0, 10)}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h2 style="color: #0369a1; margin: 0; font-size: 22px;">${company.name}</h2>
          <span style="font-size: 13px; font-weight: bold; color: #0284c7; background: #e0f2fe; padding: 4px 10px; border-radius: 6px;">${meta.title}</span>
        </div>
        <p style="margin: 6px 0 0 0; color: #64748b; font-size: 13px;">${company.address || ''} ${company.gstin ? `| GSTIN: ${company.gstin}` : ''}</p>
      </div>

      <p style="font-size: 15px; line-height: 1.5;">Dear <strong>${invoice.client.name}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        Please find attached our ${meta.title.toLowerCase()} <strong>#${invoice.invoiceNumber}</strong> for services rendered during <strong>${periodStr}</strong>.
      </p>

      ${options?.customMessage ? `
        <div style="background-color: #f1f5f9; border-left: 4px solid #0284c7; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #334155;">
          ${options.customMessage}
        </div>
      ` : ''}

      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #64748b;">Invoice Number:</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${invoice.invoiceNumber}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Issue Date:</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${issueDateStr}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Due Date:</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${dueDateStr}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Subtotal:</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">₹ ${subtotalFormatted}</td></tr>
          ${cgst ? `<tr><td style="padding: 4px 0; color: #64748b;">CGST @ 9%:</td><td style="padding: 4px 0; font-weight: 600; text-align: right;">₹ ${cgst}</td></tr>` : ''}
          ${sgst ? `<tr><td style="padding: 4px 0; color: #64748b;">SGST @ 9%:</td><td style="padding: 4px 0; font-weight: 600; text-align: right;">₹ ${sgst}</td></tr>` : ''}
          ${igst ? `<tr><td style="padding: 4px 0; color: #64748b;">IGST @ 18%:</td><td style="padding: 4px 0; font-weight: 600; text-align: right;">₹ ${igst}</td></tr>` : ''}
          <tr style="border-top: 2px solid #e2e8f0;"><td style="padding: 10px 0 4px; font-weight: bold;">Total Payable:</td><td style="padding: 10px 0 4px; font-size: 18px; font-weight: bold; text-align: right; color: #0284c7;">₹ ${totalFormatted}</td></tr>
        </table>
      </div>

      <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin: 20px 0; font-size: 13px;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #334155;">Bank Details:</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; color: #475569;">
          <div><strong>Bank:</strong> ${company.bankName || 'HDFC Bank'}</div>
          <div><strong>Account:</strong> ${company.bankAccount || '1234567890'}</div>
          <div><strong>IFSC:</strong> ${company.bankIfsc || 'HDFC0001234'}</div>
          <div><strong>A/C Name:</strong> ${company.name}</div>
        </div>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        ${includeAnnexure ? 'The complete tax invoice and attendance annexure are attached as PDF documents.' : 'The invoice PDF is attached to this email.'} 
        Kindly acknowledge receipt and schedule payment.
      </p>

      <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
        <p style="margin: 0 0 4px; font-weight: 600; color: #64748b;">${company.name}</p>
        <p style="margin: 0;">${company.address || ''} ${company.email ? `&bull; ${company.email}` : ''}</p>
      </div>
    </div>
  `;

  const mailResult = await sendMail({
    to: recipient,
    subject: `${meta.title} #${invoice.invoiceNumber} from ${company.name}`,
    html,
    fromName: company.name,
    replyTo: company.email || undefined,
    companyId,
    category: 'INVOICE',
    attachments,
  });

  if (invoice.status === 'DRAFT') {
    await prisma.taxInvoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT' },
    });
  }

  return {
    success: true,
    recipient,
    previewUrl: mailResult.previewUrl,
    isTestAccount: mailResult.isTestAccount,
    invoiceNumber: invoice.invoiceNumber,
    newStatus: invoice.status === 'DRAFT' ? 'SENT' : invoice.status,
  };
}