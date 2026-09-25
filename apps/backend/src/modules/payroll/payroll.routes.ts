import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createPayrollRun,
  processPayrollRun,
  getPayslipWithItems,
  regeneratePayslipPdf,
  computePayslipForEmployee,
  listPayrollRuns,
  getPayrollRunWithPayslips,
} from './payroll.service';

export const payrollRouter = Router();
payrollRouter.use(requireAuth);

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