import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createAssignment,
  listAssignmentsWithEmployees,
  updateAssignment,
  deleteAssignment,
} from './assignment.service';

export const assignmentRouter = Router();
assignmentRouter.use(requireAuth);

const createSchema = z.object({
  clientId: z.string().uuid(),
  employeeId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string().optional(),
});

const updateSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// CREATE — ADMIN/HR only
assignmentRouter.post('/', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const a = await createAssignment(req.user!.companyId, parsed.data);
    res.status(201).json(a);
  } catch (e: any) {
    if (e.message === 'CLIENT_NOT_FOUND')
      return res.status(404).json({ error: 'Client not found' });
    if (e.message === 'EMPLOYEE_NOT_FOUND')
      return res.status(404).json({ error: 'Employee not found' });
    if (e?.code === 'P2002')
      return res.status(409).json({ error: 'This employee is already assigned to this client' });
    console.error(e);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// LIST (optionally filtered by clientId)
assignmentRouter.get('/', async (req, res) => {
  const clientId = req.query.clientId as string | undefined;
  const assignments = await listAssignmentsWithEmployees(req.user!.companyId, clientId);
  res.json({ data: assignments });
});

// UPDATE
assignmentRouter.patch('/:id', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const a = await updateAssignment(req.user!.companyId, req.params.id as string, parsed.data);
    res.json(a);
  } catch (e: any) {
    if (e.message === 'ASSIGNMENT_NOT_FOUND')
      return res.status(404).json({ error: 'Assignment not found' });
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// DELETE
assignmentRouter.delete('/:id', requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    await deleteAssignment(req.user!.companyId, req.params.id as string);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'ASSIGNMENT_NOT_FOUND')
      return res.status(404).json({ error: 'Assignment not found' });
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});