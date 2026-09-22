import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  generateInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  deleteInvoice,
  generateInvoicePdf,
  generateInvoiceAnnexurePdf,
} from './invoice.service';

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

const generateSchema = z.object({
  clientId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  gstMode: z.enum(['auto', 'cgst_sgst', 'igst']).optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'CANCELLED']),
});

// CREATE — ADMIN only
invoiceRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const invoice = await generateInvoice(req.user!.companyId, parsed.data);
    res.status(201).json(invoice);
  } catch (e: any) {
    if (e.message === 'CLIENT_NOT_FOUND')
      return res.status(404).json({ error: 'Client not found' });
    if (e.message === 'NO_BILLABLE_HOURS')
      return res
        .status(400)
        .json({ error: 'No billable hours found for this client in the period' });
    console.error(e);
    res.status(500).json({ error: 'Failed to generate invoice', detail: e.message });
  }
});

// LIST
invoiceRouter.get('/', async (req, res) => {
  const clientId = req.query.clientId as string | undefined;
  const invoices = await listInvoices(req.user!.companyId, clientId);
  res.json({ data: invoices });
});

// GET ONE
invoiceRouter.get('/:id', async (req, res) => {
  const invoice = await getInvoiceById(req.user!.companyId, req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});
// GET PDF
invoiceRouter.get('/:id/pdf', async (req, res) => {
  try {
    const pdf = await generateInvoicePdf(req.user!.companyId, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="invoice-' + req.params.id + '.pdf"',
    );
    res.send(pdf);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    console.error(e);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});
// GET ANNEXURE PDF (employee-wise detail)
invoiceRouter.get('/:id/annexure/pdf', async (req, res) => {
  try {
    const pdf = await generateInvoiceAnnexurePdf(req.user!.companyId, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="annexure-' + req.params.id + '.pdf"',
    );
    res.send(pdf);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    console.error(e);
    res.status(500).json({ error: 'Annexure generation failed' });
  }
});

// UPDATE STATUS
invoiceRouter.patch('/:id/status', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const inv = await updateInvoiceStatus(
      req.user!.companyId,
      req.params.id as string,
      parsed.data.status,
    );
    res.json(inv);
  } catch (e: any) {
    if (e.message === 'INVOICE_NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// DELETE
invoiceRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await deleteInvoice(req.user!.companyId, req.params.id as string);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'INVOICE_NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});