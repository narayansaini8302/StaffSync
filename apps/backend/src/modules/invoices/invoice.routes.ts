import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import { createEmailRateLimiter } from '../../middleware/rate-limit';
import {
  generateInvoice,
  createManualInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  deleteInvoice,
  generateInvoicePdf,
  generateInvoiceAnnexurePdf,
  sendInvoiceEmail,
  recordInvoicePayment,
  deleteInvoicePayment,
} from './invoice.service';

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);

const invoiceEmailLimiter = createEmailRateLimiter({
  windowSec: 60,
  maxRequests: 15,
  keyPrefix: 'email:invoice',
  message: 'Invoice email rate limit exceeded. Please wait a minute before sending more invoices.',
});

const generateSchema = z.object({
  clientId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
  gstMode: z.enum(['auto', 'cgst_sgst', 'igst']).optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  invoiceNumber: z.string().optional(),
});

const manualInvoiceSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientName: z.string().min(1, 'Client name is required'),
  clientAddress: z.string().optional(),
  clientGstin: z.string().optional(),
  clientStateCode: z.string().optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  invoiceTitle: z.string().optional(),
  invoiceNumber: z.string().optional(),
  issuedAt: z.string().optional(),
  dueDate: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  notes: z.string().optional(),
  gstMode: z.enum(['auto', 'cgst_sgst', 'igst', 'none']).optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, 'Description required'),
        quantity: z.number().positive('Quantity must be greater than 0'),
        rate: z.number().min(0, 'Rate cannot be negative'),
        category: z.string().optional(),
      }),
    )
    .min(1, 'At least one line item is required'),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'PARTIAL', 'CANCELLED']),
});

const paymentSchema = z.object({
  amount: z.number().positive('Payment amount must be greater than 0'),
  paymentDate: z.string().optional(),
  paymentMode: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

// CREATE MANUAL / GENERAL INVOICE — ADMIN only
invoiceRouter.post('/manual', requireRole('ADMIN'), async (req, res) => {
  const parsed = manualInvoiceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const invoice = await createManualInvoice(req.user!.companyId, parsed.data as any);
    res.status(201).json(invoice);
  } catch (e: any) {
    if (e.message === 'CLIENT_REQUIRED')
      return res.status(400).json({ error: 'Client name or valid Client ID is required' });
    if (e.message === 'AT_LEAST_ONE_LINE_ITEM_REQUIRED')
      return res.status(400).json({ error: 'At least one line item is required' });
    console.error(e);
    res.status(500).json({ error: 'Failed to create manual invoice', detail: e.message });
  }
});

// CREATE AUTOMATED ATTENDANCE TAX INVOICE — ADMIN only
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
  const invoice = await getInvoiceById(req.user!.companyId, String(req.params.id));
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
});
// GET PDF
invoiceRouter.get('/:id/pdf', async (req, res) => {
  try {
    const pdf = await generateInvoicePdf(req.user!.companyId, String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="invoice-' + String(req.params.id) + '.pdf"',
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
    const pdf = await generateInvoiceAnnexurePdf(req.user!.companyId, String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="annexure-' + String(req.params.id) + '.pdf"',
    );
    res.send(pdf);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    console.error(e);
    res.status(500).json({ error: 'Annexure generation failed' });
  }
});

// SEND INVOICE EMAIL TO CLIENT — ADMIN or HR
invoiceRouter.post('/:id/send-email', requireRole('ADMIN', 'HR'), invoiceEmailLimiter, async (req, res) => {
  const sendSchema = z.object({
    recipientEmail: z.string().email().optional(),
    includeAnnexure: z.boolean().optional(),
    customMessage: z.string().optional(),
  });
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await sendInvoiceEmail(
      req.user!.companyId,
      String(req.params.id),
      parsed.data,
    );
    res.json(result);
  } catch (e: any) {
    if (e.message === 'NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    if (e.message === 'RECIPIENT_EMAIL_REQUIRED')
      return res.status(400).json({ error: 'Client has no email configured. Please enter a recipient email address.' });
    console.error('[Invoice Email Error]:', e);
    res.status(500).json({ error: 'Failed to send invoice email', detail: e.message });
  }
});

// UPDATE STATUS

invoiceRouter.patch('/:id/status', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const inv = await updateInvoiceStatus(
      req.user!.companyId,
      String(String(req.params.id)) as string,
      parsed.data.status,
    );
    res.json(inv);
  } catch (e: any) {
    if (e.message === 'INVOICE_NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// PAYMENTS — RECORD PAYMENT (ADMIN or HR)
invoiceRouter.post('/:id/payments', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await recordInvoicePayment(
      req.user!.companyId,
      String(req.params.id),
      parsed.data,
    );
    res.status(201).json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message === 'INVOICE_NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    if (e.message === 'INVALID_PAYMENT_AMOUNT')
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    console.error('[Record Payment Error]:', e);
    res.status(500).json({ error: 'Failed to record payment', detail: e.message });
  }
});

// PAYMENTS — DELETE PAYMENT (ADMIN)
invoiceRouter.delete('/:id/payments/:paymentId', requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await deleteInvoicePayment(
      req.user!.companyId,
      String(req.params.id),
      String(req.params.paymentId),
    );
    res.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message === 'INVOICE_NOT_FOUND' || e.message === 'PAYMENT_NOT_FOUND')
      return res.status(404).json({ error: e.message });
    console.error('[Delete Payment Error]:', e);
    res.status(500).json({ error: 'Failed to delete payment', detail: e.message });
  }
});

// DELETE
invoiceRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await deleteInvoice(req.user!.companyId, String(req.params.id) as string);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'INVOICE_NOT_FOUND')
      return res.status(404).json({ error: 'Invoice not found' });
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});