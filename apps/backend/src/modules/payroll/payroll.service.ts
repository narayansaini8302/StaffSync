import { prisma } from '../../config/prisma';
import { payrollConfig } from '../../config/payroll';
import { renderPdf } from '../../utils/pdf';
import { uploadPdfToS3, getPdfFromS3 } from '../../utils/s3';
import { sendMail, sendMailBatch } from '../../utils/email';
import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import {
  categoryDefaults,
  EmployeeCategoryKey,
} from '../../config/employee-categories';

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function fmt(n: number | Prisma.Decimal) {
  const num = typeof n === 'number' ? n : Number(n);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export interface ComputedPayslip {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  email?: string | null;
  category: EmployeeCategoryKey;
  customCategory?: string | null;
  hourlyRate: number;
  totalHours: number;

  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays?: number;
  overtimeMins: number;
  lateMins: number;

  grossPay: number;
  totalDeductions: number;
  netPay: number;

  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
}

// ---------------------------------------------------------------------------
// Compute payslip for a single employee
// ---------------------------------------------------------------------------

export async function computePayslipForEmployee(
  companyId: string,
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<ComputedPayslip | null> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
  });
  if (!employee) return null;

  const days = await prisma.attendanceDay.findMany({
    where: {
      employeeId,
      companyId,
      date: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { date: 'asc' },
  });

  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let totalMinutes = 0;
  let overtimeMins = 0;
  let lateMins = 0;

  for (const d of days) {
    if (d.status === 'PRESENT') {
      presentDays += 1;
      totalMinutes += d.totalMinutes;
    } else if (d.status === 'HALF_DAY') {
      halfDays += 1;
      totalMinutes += d.totalMinutes;
    } else if (d.status === 'ABSENT') {
      absentDays += 1;
      // ABSENT: unpaid, 0 minutes (deducts money)
    } else if (d.status === 'LEAVE') {
      leaveDays += 1;
      // LEAVE: paid leave, do NOT deduct money (credit 8 hours = 480 mins)
      totalMinutes += d.totalMinutes > 0 ? d.totalMinutes : 480;
    }
    overtimeMins += d.overtimeMins;
    lateMins += d.lateMins;
  }

  let totalHours = totalMinutes / 60;

  // Unmarked days handling:
  // If an employee is completely unmarked or has unmarked days in the period,
  // automatically count those unmarked days as ABSENT (deduct pay), NOT full present.
  const totalPeriodDays = periodEnd ? periodEnd.getUTCDate() : payrollConfig.daysInMonth;
  const markedDaysCount = presentDays + halfDays + leaveDays + absentDays;
  if (markedDaysCount < totalPeriodDays) {
    absentDays += (totalPeriodDays - markedDaysCount);
  }

  const category = (employee.category as EmployeeCategoryKey) || 'HOUSEKEEPING';
  const catDef = categoryDefaults[category] || categoryDefaults.HOUSEKEEPING;
  const hourlyRate =
    employee.baseSalary && Number(employee.baseSalary) > 0
      ? round2(Number(employee.baseSalary) / (payrollConfig.daysInMonth * payrollConfig.standardHoursPerDay))
      : catDef.perHour;

  const basePay = round2(totalHours * hourlyRate);

  const basic = round2(basePay * payrollConfig.earningsSplit.basic);
  const hra = round2(basePay * payrollConfig.earningsSplit.hra);
  const specialAllowance = round2(basePay - basic - hra);
  const grossPay = round2(basic + hra + specialAllowance);

  // PF: 13% on basic pay (if pfApplicable !== false)
  const pf = employee.pfApplicable !== false ? round2(basic * payrollConfig.pfRate) : 0;

  // ESI: 3.75% on gross pay (if esiApplicable !== false)
  const esi = employee.esiApplicable !== false ? round2(grossPay * payrollConfig.esiRate) : 0;

  const professionalTax =
    grossPay > payrollConfig.professionalTax.threshold
      ? payrollConfig.professionalTax.amount
      : 0;

  const monthlyTaxable = grossPay;
  const annualTaxable = monthlyTaxable * 12;
  let annualTax = 0;
  let lastCap = 0;
  for (const slab of payrollConfig.taxSlabs) {
    if (annualTaxable > lastCap) {
      const taxableInSlab = Math.min(annualTaxable, slab.upTo) - lastCap;
      annualTax += taxableInSlab * slab.rate;
      lastCap = slab.upTo;
    }
  }
  const incomeTax = round2(annualTax / 12);

  const deductions = [
    { label: 'Provident Fund (PF)', amount: pf },
    { label: 'Employee State Insurance (ESI)', amount: esi },
    { label: 'Professional Tax', amount: professionalTax },
    { label: 'Income Tax', amount: incomeTax },
  ].filter((d) => d.amount > 0);

  const totalDeductions = round2(deductions.reduce((s, d) => s + d.amount, 0));
  const netPay = round2(grossPay - totalDeductions);

  const earnings = [
    { label: 'Basic', amount: basic },
    { label: 'House Rent Allowance (HRA)', amount: hra },
    { label: 'Special Allowance', amount: specialAllowance },
  ];

  return {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
    email: employee.email || null,
    category,
    customCategory: employee.customCategory ?? null,
    hourlyRate,
    totalHours: round2(totalHours),
    presentDays,
    absentDays,
    halfDays,
    leaveDays,
    overtimeMins,
    lateMins,
    grossPay,
    totalDeductions,
    netPay,
    earnings,
    deductions,
  };
}

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

const templatePath = path.join(__dirname, 'templates', 'payslip.hbs');
const templateSource = fs.readFileSync(templatePath, 'utf8');
const compiledTemplate = Handlebars.compile(templateSource);

async function renderPayslipPdf(input: {
  companyName: string;
  companyAddress?: string | null;
  companyGstin?: string | null;
  companyLogo?: string | null;
  periodStart: Date;
  periodEnd: Date;
  slip: ComputedPayslip;
}): Promise<Buffer> {
  const data = {
    companyName: input.companyName,
    companyAddress: input.companyAddress ?? null,
    companyGstin: input.companyGstin ?? null,
    companyLogo: input.companyLogo ?? null,
    periodStart: input.periodStart.toISOString().slice(0, 10),
    periodEnd: input.periodEnd.toISOString().slice(0, 10),
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    employeeName: input.slip.employeeName,
    employeeCode: input.slip.employeeCode,
    email: input.slip.email,
    category:
      input.slip.category === 'CUSTOM'
        ? input.slip.customCategory || 'Custom'
        : categoryDefaults[input.slip.category]?.label || input.slip.category,
    hourlyRate: fmt(input.slip.hourlyRate),
    totalHours: input.slip.totalHours.toFixed(2),
    presentDays: input.slip.presentDays,
    halfDays: input.slip.halfDays,
    absentDays: input.slip.absentDays,
    leaveDays: input.slip.leaveDays || 0,
    earnings: input.slip.earnings.map((e) => ({ label: e.label, amount: fmt(e.amount) })),
    deductions: input.slip.deductions.map((d) => ({ label: d.label, amount: fmt(d.amount) })),
    grossPay: fmt(input.slip.grossPay),
    totalDeductions: fmt(input.slip.totalDeductions),
    netPay: fmt(input.slip.netPay),
    currency: payrollConfig.currency,
  };
  const html = compiledTemplate(data);
  return renderPdf(html);
}

// ---------------------------------------------------------------------------
// Payroll run creation & processing
// ---------------------------------------------------------------------------

export async function createPayrollRun(companyId: string, periodStartInput: string) {
  const ref = new Date(periodStartInput);
  const periodStart = startOfMonthUTC(ref);
  const periodEnd = endOfMonthUTC(ref);

  const existing = await prisma.payrollRun.findUnique({
    where: { companyId_periodStart_periodEnd: { companyId, periodStart, periodEnd } },
  });
  if (existing) {
    if (existing.status === 'DRAFT') {
      return existing;
    }
    throw new Error('RUN_EXISTS');
  }

  return prisma.payrollRun.create({
    data: { companyId, periodStart, periodEnd, status: 'DRAFT' },
  });
}

export async function processPayrollRun(
  companyId: string,
  runId: string,
  companyName = 'Attendance System',
) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
  });
  if (!run) throw new Error('RUN_NOT_FOUND');
  if (run.status === 'COMPLETED') throw new Error('ALREADY_COMPLETED');

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
  });

  // Clear any existing payslips for this draft run to safely allow retrying
  await prisma.payslip.deleteMany({
    where: { payrollRunId: run.id },
  });

  let totalGross = 0;
  let totalNet = 0;
  let count = 0;
  let companyInfo: Awaited<ReturnType<typeof import('../company/company.service').getCompanyForPdf>> | null = null;
  for (const emp of employees) {
    const slip = await computePayslipForEmployee(
      companyId,
      emp.id,
      run.periodStart,
      run.periodEnd,
    );
    if (!slip) continue;

    // Fetch company info once (cache it for the loop)
    if (!companyInfo) {
      const { getCompanyForPdf } = await import('../company/company.service');
      companyInfo = await getCompanyForPdf(companyId);
    }

    const pdfBuffer = await renderPayslipPdf({
      companyName: companyInfo.name,
      companyAddress: companyInfo.address,
      companyGstin: companyInfo.gstin,
      companyLogo: companyInfo.logoPath,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      slip,
    });

    const periodStr = run.periodStart.toISOString().slice(0, 7);
    const s3Key = `payslips/${companyId}/${run.id}/payslip-${slip.employeeCode}-${periodStr}.pdf`;
    const s3Url = await uploadPdfToS3(pdfBuffer, s3Key);

    const payslipRow = await prisma.payslip.create({
      data: {
        payrollRunId: run.id,
        employeeId: slip.employeeId,
        employeeCode: slip.employeeCode,
        employeeName: slip.employeeName,
        email: slip.email || null,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        pdfPath: s3Url,
        presentDays: slip.presentDays,
        absentDays: slip.absentDays,
        halfDays: slip.halfDays,
        overtimeMins: slip.overtimeMins,
        lateMins: slip.lateMins,
        grossPay: slip.grossPay,
        totalDeductions: slip.totalDeductions,
        netPay: slip.netPay,
        currency: payrollConfig.currency,
        lineItems: {
          create: [
            ...slip.earnings.map((e, i) => ({
              category: 'EARNING',
              label: e.label,
              amount: e.amount,
              sortOrder: i,
            })),
            ...slip.deductions.map((d, i) => ({
              category: 'DEDUCTION',
              label: d.label,
              amount: d.amount,
              sortOrder: i,
            })),
          ],
        },
      },
    });

    if (slip.email && slip.email.includes('@')) {
      try {
        await sendMail({
          to: slip.email,
          subject: 'Payslip for ' + run.periodStart.toISOString().slice(0, 7),
          html:
            '<p>Hi ' +
            slip.employeeName +
            ',</p>' +
            '<p>Your payslip for the period ' +
            run.periodStart.toISOString().slice(0, 10) +
            ' to ' +
            run.periodEnd.toISOString().slice(0, 10) +
            ' is attached.</p>' +
            '<p>Net Pay: <strong>' +
            fmt(slip.netPay) +
            ' ' +
            payrollConfig.currency +
            '</strong></p>' +
            '<p>- Attendance System</p>',
          attachments: [
            {
              filename:
                'payslip-' +
                slip.employeeCode +
                '-' +
                run.periodStart.toISOString().slice(0, 7) +
                '.pdf',
              content: pdfBuffer,
            },
          ],
        });
        await prisma.payslip.update({
          where: { id: payslipRow.id },
          data: { emailedAt: new Date() },
        });
      } catch (err) {
        console.error('Failed to email payslip for ' + slip.email + ':', err);
      }
    }

    totalGross += slip.grossPay;
    totalNet += slip.netPay;
    count += 1;
  }

  return prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      status: 'COMPLETED',
      totalGross: round2(totalGross),
      totalNet: round2(totalNet),
      totalEmployees: count,
    },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listPayrollRuns(companyId: string) {
  return prisma.payrollRun.findMany({
    where: { companyId },
    orderBy: { periodStart: 'desc' },
    include: { _count: { select: { payslips: true } } },
  });
}

export async function getPayrollRunWithPayslips(companyId: string, runId: string) {
  return prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
    include: { payslips: { orderBy: { employeeCode: 'asc' } } },
  });
}

export async function getPayslipWithItems(companyId: string, payslipId: string) {
  // Verify the payslip's payroll run belongs to this company
  const slip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      payrollRun: { select: { companyId: true } },
      lineItems: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!slip || slip.payrollRun.companyId !== companyId) return null;
  return slip;
}

// ---------------------------------------------------------------------------
// Regenerate PDF for download
// ---------------------------------------------------------------------------

export async function regeneratePayslipPdf(
  companyId: string,
  payslipId: string,
  companyName = 'Attendance System',
) {
  const slip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      payrollRun: { select: { companyId: true } },
      lineItems: true,
    },
  });
  if (!slip || slip.payrollRun.companyId !== companyId) throw new Error('NOT_FOUND');

  // If already uploaded to S3, serve existing PDF directly
  if (slip.pdfPath) {
    const cachedBuffer = await getPdfFromS3(slip.pdfPath);
    if (cachedBuffer) {
      return cachedBuffer;
    }
  }

  // Fetch the employee to get their category
  const employee = await prisma.employee.findFirst({
    where: { id: slip.employeeId, companyId },
  });
  const category = (employee?.category as EmployeeCategoryKey) || 'HOUSEKEEPING';
  const catDef = categoryDefaults[category] || categoryDefaults.HOUSEKEEPING;
  const hourlyRate =
    employee?.baseSalary && Number(employee.baseSalary) > 0
      ? round2(Number(employee.baseSalary) / (payrollConfig.daysInMonth * payrollConfig.standardHoursPerDay))
      : catDef.perHour;

  // Recompute hours from attendance_days in the period
  const days = await prisma.attendanceDay.findMany({
    where: {
      employeeId: slip.employeeId,
      companyId,
      date: { gte: slip.periodStart, lte: slip.periodEnd },
    },
  });
  let totalMinutes = 0;
  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let leaveDays = 0;

  for (const d of days) {
    if (d.status === 'PRESENT') {
      presentDays += 1;
      totalMinutes += d.totalMinutes;
    } else if (d.status === 'HALF_DAY') {
      halfDays += 1;
      totalMinutes += d.totalMinutes;
    } else if (d.status === 'ABSENT') {
      absentDays += 1;
    } else if (d.status === 'LEAVE') {
      leaveDays += 1;
      totalMinutes += d.totalMinutes > 0 ? d.totalMinutes : 480;
    }
  }

  let totalHours = totalMinutes / 60;
  const totalPeriodDays = slip.periodEnd ? new Date(slip.periodEnd).getUTCDate() : payrollConfig.daysInMonth;
  const markedDaysCount = presentDays + halfDays + leaveDays + absentDays;
  if (markedDaysCount < totalPeriodDays) {
    absentDays += (totalPeriodDays - markedDaysCount);
  }

  const earnings = slip.lineItems
    .filter((i) => i.category === 'EARNING')
    .map((i) => ({ label: i.label, amount: Number(i.amount) }));
  const deductions = slip.lineItems
    .filter((i) => i.category === 'DEDUCTION')
    .map((i) => ({ label: i.label, amount: Number(i.amount) }));

  const computed: ComputedPayslip = {
    employeeId: slip.employeeId,
    employeeCode: slip.employeeCode,
    employeeName: slip.employeeName,
    email: slip.email,
    category,
    customCategory: employee?.customCategory ?? null,
    hourlyRate,
    totalHours,
    presentDays,
    absentDays,
    halfDays,
    leaveDays,
    overtimeMins: slip.overtimeMins,
    lateMins: slip.lateMins,
    grossPay: Number(slip.grossPay),
    totalDeductions: Number(slip.totalDeductions),
    netPay: Number(slip.netPay),
    earnings,
    deductions,
  };

  const { getCompanyForPdf } = await import('../company/company.service');
  const company = await getCompanyForPdf(companyId);

  const pdfBuffer = await renderPayslipPdf({
    companyName: company.name,
    companyAddress: company.address,
    companyGstin: company.gstin,
    companyLogo: company.logoPath,
    periodStart: slip.periodStart,
    periodEnd: slip.periodEnd,
    slip: computed,
  });

  const periodStr = slip.periodStart.toISOString().slice(0, 7);
  const s3Key = `payslips/${companyId}/${slip.payrollRunId}/payslip-${slip.employeeCode}-${periodStr}.pdf`;
  const s3Url = await uploadPdfToS3(pdfBuffer, s3Key);
  if (s3Url && s3Url !== slip.pdfPath) {
    await prisma.payslip.update({
      where: { id: slip.id },
      data: { pdfPath: s3Url },
    });
  }

  return pdfBuffer;
}

// ---------------------------------------------------------------------------
// Email Payslip
// ---------------------------------------------------------------------------

export async function sendPayslipEmail(
  companyId: string,
  payslipId: string,
  customRecipient?: string,
) {
  const slip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      payrollRun: { select: { companyId: true, periodStart: true, periodEnd: true } },
    },
  });
  if (!slip || slip.payrollRun.companyId !== companyId) throw new Error('NOT_FOUND');

  const recipient = (customRecipient || slip.email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    throw new Error('RECIPIENT_EMAIL_REQUIRED');
  }

  const { getCompanyForPdf } = await import('../company/company.service');
  const company = await getCompanyForPdf(companyId);

  const pdfBuffer = await regeneratePayslipPdf(companyId, payslipId, company.name);
  const periodStr = slip.periodStart.toISOString().slice(0, 7);
  const formattedNetPay = fmt(slip.netPay);

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #1e3a8a; margin: 0 0 6px 0; font-size: 22px;">${company.name || 'StaffSync'}</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">Salary Payslip — ${periodStr}</p>
      </div>

      <p style="font-size: 15px; line-height: 1.5;">Dear <strong>${slip.employeeName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.5; color: #475569;">
        Please find attached your salary payslip for the billing period 
        <strong>${slip.periodStart.toISOString().slice(0, 10)}</strong> to 
        <strong>${slip.periodEnd.toISOString().slice(0, 10)}</strong>.
      </p>

      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Employee Code:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;">${slip.employeeCode}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Gross Earnings:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right;">₹ ${fmt(slip.grossPay)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;">Total Deductions:</td>
            <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #ef4444;">- ₹ ${fmt(slip.totalDeductions)}</td>
          </tr>
          <tr style="border-top: 1px solid #e2e8f0;">
            <td style="padding: 10px 0 4px 0; font-size: 16px; font-weight: bold; color: #0f172a;">Net Pay:</td>
            <td style="padding: 10px 0 4px 0; font-size: 18px; font-weight: bold; text-align: right; color: #16a34a;">₹ ${formattedNetPay}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        A copy of your payslip has been attached as a PDF to this email for your records. If you have any questions regarding your salary computation or deductions, please contact HR or Finance.
      </p>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
        <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">${company.name}</p>
        <p style="margin: 0 0 6px 0;">${company.address || ''} ${company.email ? `&bull; ${company.email}` : ''}</p>
        <p style="margin: 0; font-style: italic;">CONFIDENTIALITY NOTICE: This transmission is intended solely for the designated recipient. It contains confidential financial and employment data. If you have received this message in error, please notify HR immediately.</p>
      </div>
    </div>
  `;

  const filename = `payslip-${slip.employeeCode}-${periodStr}.pdf`;
  const mailResult = await sendMail({
    to: recipient,
    subject: `Payslip for ${periodStr} - ${slip.employeeName} (${slip.employeeCode})`,
    html,
    fromName: company.name,
    replyTo: company.email || undefined,
    companyId,
    category: 'PAYSLIP',
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });

  const now = new Date();
  await prisma.payslip.update({
    where: { id: payslipId },
    data: { emailedAt: now },
  });

  return {
    success: true,
    recipient,
    previewUrl: mailResult.previewUrl,
    isTestAccount: mailResult.isTestAccount,
    emailedAt: now,
  };
}

export async function sendPayrollRunEmails(companyId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
    include: { payslips: true },
  });
  if (!run) throw new Error('RUN_NOT_FOUND');

  const eligibleSlips = run.payslips.filter((s) => s.email && s.email.includes('@'));
  const missingEmails = run.payslips.filter((s) => !s.email || !s.email.includes('@'));

  const missingErrors = missingEmails.map((s) => ({
    payslipId: s.id,
    employeeName: s.employeeName,
    error: 'No valid email address configured',
  }));

  const batchResult = await sendMailBatch(
    eligibleSlips,
    async (slip) => {
      await sendPayslipEmail(companyId, slip.id);
    },
    2, // 2 concurrent workers for smooth pacing
    200, // 200ms spacing to respect SMTP quotas
  );

  return {
    total: run.payslips.length,
    sent: batchResult.processed,
    failed: batchResult.errors.length + missingErrors.length,
    errors: [
      ...missingErrors,
      ...batchResult.errors.map((e) => ({
        payslipId: e.item.id,
        employeeName: e.item.employeeName,
        error: e.error,
      })),
    ],
  };
}

export async function deletePayrollRun(companyId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, companyId },
  });
  if (!run) throw new Error('RUN_NOT_FOUND');
  await prisma.payrollRun.delete({
    where: { id: runId },
  });
  return true;
}
