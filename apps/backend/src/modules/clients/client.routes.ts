import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createClient,
  listClients,
  getClientById,
  updateClient,
  deleteClient,
  setClientRate,
  removeClientRate,
} from './client.service';

export const clientRouter = Router();
clientRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().min(2),
  gstin: z.string().optional(),
  address: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  stateCode: z.string().length(2).optional(),
});

const updateSchema = createSchema.partial();

const rateSchema = z.object({
  category: z.enum(['HOUSEKEEPING', 'SEMI_SKILLED', 'SECURITY_GUARD', 'SUPERVISOR']),
  hourlyRate: z.number().positive(),
});

// CREATE — ADMIN/HR only
clientRouter.post('/', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const client = await createClient(req.user!.companyId, parsed.data);
    res.status(201).json(client);
  } catch (e: any) {
    if (e?.code === 'P2002')
      return res.status(409).json({ error: 'Client name already exists' });
    console.error(e);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// LIST
clientRouter.get('/', async (req, res) => {
  const clients = await listClients(req.user!.companyId);
  res.json({ data: clients });
});

// GET ONE
clientRouter.get('/:id', async (req, res) => {
  const client = await getClientById(req.user!.companyId, req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

// UPDATE
clientRouter.patch('/:id', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const client = await updateClient(req.user!.companyId, req.params.id, parsed.data);
    res.json(client);
  } catch (e: any) {
    if (e.message === 'CLIENT_NOT_FOUND')
      return res.status(404).json({ error: 'Client not found' });
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE
clientRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await deleteClient(req.user!.companyId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'CLIENT_NOT_FOUND')
      return res.status(404).json({ error: 'Client not found' });
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

// Rate overrides
clientRouter.post('/:id/rates', requireRole('ADMIN', 'HR'), async (req, res) => {
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const rate = await setClientRate(req.user!.companyId, req.params.id, parsed.data);
    res.json(rate);
  } catch (e: any) {
    if (e.message === 'CLIENT_NOT_FOUND')
      return res.status(404).json({ error: 'Client not found' });
    res.status(500).json({ error: 'Failed to set rate' });
  }
});

clientRouter.delete('/:id/rates/:category', requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const category = req.params.category as any;
    await removeClientRate(req.user!.companyId, req.params.id, category);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'CLIENT_NOT_FOUND')
      return res.status(404).json({ error: 'Client not found' });
    res.status(500).json({ error: 'Failed to remove rate' });
  }
});