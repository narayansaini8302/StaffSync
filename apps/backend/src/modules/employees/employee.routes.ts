import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import { createEmailRateLimiter } from '../../middleware/rate-limit';
import {
  createEmployee,
  listEmployees,
  getEmployeeById,
  updateEmployee,
  deactivateEmployee,
  generateJoiningLetterPdf,
  sendJoiningLetterEmail,
} from './employee.service';

export const employeeRouter = Router();

employeeRouter.use(requireAuth);

const joiningLetterEmailLimiter = createEmailRateLimiter({
  windowSec: 60,
  maxRequests: 15,
  keyPrefix: 'email:joining-letter',
  message: 'Joining letter email rate limit exceeded. Please wait a minute before sending more letters.',
});

const categoryEnum = z.enum([
  'HOUSEKEEPING',
  'SEMI_SKILLED',
  'SECURITY_GUARD',
  'SUPERVISOR',
]);

const createSchema = z.object({
  employeeCode: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().min(1),
  fatherName: z.string().min(1),
  category: categoryEnum.optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).optional(),
  dateOfJoining: z.string(),
  baseSalary: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  userId: z.string().uuid().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
  dateOfLeaving: z.string().nullable().optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  department: z.string().optional(),
  category: categoryEnum.optional(),
  isActive: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
});

// CREATE — admin / HR only
employeeRouter.post('/', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const emp = await createEmployee(req.user!.companyId, parsed.data);
    res.status(201).json(emp);
  } catch (e: any) {
    if (e.message === 'EMPLOYEE_CODE_TAKEN')
      return res.status(409).json({ error: 'Employee code already in use' });
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'Email or code already exists', target: e.meta?.target });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
});

// LIST
employeeRouter.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await listEmployees(req.user!.companyId, parsed.data);
  res.json(result);
});

// GET ONE
employeeRouter.get('/:id', async (req, res) => {
  const emp = await getEmployeeById(req.user!.companyId, String(req.params.id));
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

// UPDATE — admin / HR only
employeeRouter.patch('/:id', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const emp = await updateEmployee(req.user!.companyId, String(req.params.id) as string, parsed.data);
    res.json(emp);
  } catch (e: any) {
    if (e.message === 'EMPLOYEE_NOT_FOUND')
      return res.status(404).json({ error: 'Employee not found' });
    if (e.message === 'ADDRESS_REQUIRED')
      return res.status(400).json({ error: 'Address is required' });
    if (e.message === 'FATHER_NAME_REQUIRED')
      return res.status(400).json({ error: "Father's name is required" });
    if (e.message === 'EMPLOYEE_CODE_TAKEN')
      return res.status(409).json({ error: 'Employee code already in use' });
    if (e?.code === 'P2002')
      return res.status(409).json({ error: 'Conflict', target: e.meta?.target });
    res.status(500).json({ error: 'Failed to update employee' });
  }
});


// GET JOINING LETTER PDF
employeeRouter.get('/:id/joining-letter/pdf', async (req, res) => {
  try {
    const pdf = await generateJoiningLetterPdf(req.user!.companyId, String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="joining-letter-' + String(req.params.id) + '.pdf"',
    );
    res.send(pdf);
  } catch (e: any) {
    if (e.message === 'EMPLOYEE_NOT_FOUND')
      return res.status(404).json({ error: 'Employee not found' });
    console.error(e);
    res.status(500).json({ error: 'Joining letter generation failed' });
  }
});

// SEND JOINING LETTER EMAIL — admin / HR
employeeRouter.post('/:id/joining-letter/send-email', requireRole('ADMIN', 'HR'), joiningLetterEmailLimiter, async (req, res) => {
  const emailSchema = z.object({
    recipientEmail: z.string().email().optional(),
  });
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await sendJoiningLetterEmail(
      req.user!.companyId,
      String(req.params.id),
      parsed.data.recipientEmail,
    );
    res.json(result);
  } catch (e: any) {
    if (e.message === 'EMPLOYEE_NOT_FOUND')
      return res.status(404).json({ error: 'Employee not found' });
    if (e.message === 'RECIPIENT_EMAIL_REQUIRED')
      return res.status(400).json({ error: 'Employee has no valid email address configured' });
    console.error('[Joining Letter Email Error]:', e);
    res.status(500).json({ error: 'Failed to send joining letter email', detail: e.message });
  }
});



// SOFT DELETE — admin / HR only
employeeRouter.delete('/:id', requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const emp = await deactivateEmployee(req.user!.companyId, String(req.params.id) as string);
    res.json({ id: emp.id, isActive: emp.isActive, dateOfLeaving: emp.dateOfLeaving });
  } catch (e: any) {
    if (e.message === 'EMPLOYEE_NOT_FOUND')
      return res.status(404).json({ error: 'Employee not found' });
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});