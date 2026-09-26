import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import { createEmailRateLimiter } from '../../middleware/rate-limit';
import {
  createPayrollRun,
  processPayrollRun,
  getPayslipWithItems,
  regeneratePayslipPdf,
  computePayslipForEmployee,
  listPayrollRuns,
  getPayrollRunWithPayslips,
  sendPayslipEmail,
  sendPayrollRunEmails,
} from './payroll.service';

export const payrollRouter = Router();
payrollRouter.use(requireAuth);

const singleEmailLimiter = createEmailRateLimiter({
  windowSec: 60,
  maxRequests: 15,
  keyPrefix: 'email:payslip',
  message: 'Email rate limit exceeded. Please wait a minute before sending more payslips.',
});

const bulkEmailLimiter = createEmailRateLimiter({
  windowSec: 300,
  maxRequests: 3,
  keyPrefix: 'email:payroll-bulk',
  message: 'Bulk payroll email rate limit exceeded. Please wait a few minutes before triggering another bulk run.',
});

const runSchema = z.object({
  periodStart: z.string(),
  companyName: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

payrollRouter.post('/runs', requireRole('ADMIN'), async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const run = await createPayrollRun(req.user!.companyId, parsed.data.periodStart);
    const completed = await processPayrollRun(
      req.user!.companyId,
      run.id,
      parsed.data.companyName,
    );
    res.status(201).json(completed);
  } catch (e: any) {
    if (e.message === 'RUN_EXISTS')
      return res.status(409).json({ error: 'Payroll run for this period already exists' });
    console.error(e);
    res.status(500).json({ error: 'Payroll run failed', detail: e.message });
  }
});

payrollRouter.get('/runs', async (req, res) => {
  const runs = await listPayrollRuns(req.user!.companyId);
  res.json({ data: runs });
});

payrollRouter.get('/runs/:id', async (req, res) => {
  const run = await getPayrollRunWithPayslips(req.user!.companyId, String(req.params.id));
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// ---------------------------------------------------------------------------
// Payslips
// ---------------------------------------------------------------------------

payrollRouter.get('/payslips/:id', async (req, res) => {
  const slip = await getPayslipWithItems(req.user!.companyId, String(req.params.id));
  if (!slip) return res.status(404).json({ error: 'Payslip not found' });
  res.json(slip);
});

payrollRouter.get('/payslips/:id/pdf', async (req, res) => {
  try {
    const pdf = await regeneratePayslipPdf(
      req.user!.companyId,
      String(req.params.id),
      req.query.companyName as string | undefined,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="payslip-' + String(req.params.id) + '.pdf"',
    );
    res.send(pdf);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')
      return res.status(404).json({ error: 'Payslip not found' });
    console.error(e);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// EMAIL SINGLE PAYSLIP
payrollRouter.post('/payslips/:id/send-email', requireRole('ADMIN', 'HR'), singleEmailLimiter, async (req, res) => {
  const emailSchema = z.object({
    recipientEmail: z.string().email().optional(),
  });
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await sendPayslipEmail(
      req.user!.companyId,
      String(req.params.id),
      parsed.data.recipientEmail,
    );
    res.json(result);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')
      return res.status(404).json({ error: 'Payslip not found' });
    if (e.message === 'RECIPIENT_EMAIL_REQUIRED')
      return res.status(400).json({ error: 'Employee has no valid email address configured' });
    console.error('[Payroll Email Error]:', e);
    res.status(500).json({ error: 'Failed to send payslip email', detail: e.message });
  }
});

// BULK EMAIL PAYSLIPS IN A RUN
payrollRouter.post('/runs/:id/send-emails', requireRole('ADMIN', 'HR'), bulkEmailLimiter, async (req, res) => {
  try {
    const result = await sendPayrollRunEmails(req.user!.companyId, String(req.params.id));
    res.json(result);
  } catch (e: any) {
    if (e.message === 'RUN_NOT_FOUND')
      return res.status(404).json({ error: 'Payroll run not found' });
    console.error('[Payroll Bulk Email Error]:', e);
    res.status(500).json({ error: 'Failed to send payroll emails', detail: e.message });
  }
});


// ---------------------------------------------------------------------------
// Preview (no persistence)
// ---------------------------------------------------------------------------

payrollRouter.get('/preview/:employeeId', async (req, res) => {
  const periodStartInput = (req.query.periodStart as string) ?? new Date().toISOString();
  const ref = new Date(periodStartInput);
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));

  const slip = await computePayslipForEmployee(
    req.user!.companyId,
    req.params.employeeId,
    start,
    end,
  );
  if (!slip)
    return res.status(404).json({ error: 'Employee has no salary configured or not found' });
  res.json(slip);
});