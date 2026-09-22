import { Router } from 'express';
import { z } from 'zod';
import { requireSuperAdmin } from '../../middleware/auth';
import {
  createCompanyWithAdmin,
  listCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  listCompanyAdmins,
  createCompanyAdmin,
  deleteUser,
  getGlobalStats,
} from './super-admin.service';

export const superAdminRouter = Router();

// Everything below requires a valid super admin token
superAdminRouter.use(requireSuperAdmin);

// ---------------------------------------------------------------
// Global stats
// ---------------------------------------------------------------

superAdminRouter.get('/stats', async (_req, res) => {
  const stats = await getGlobalStats();
  res.json(stats);
});

// ---------------------------------------------------------------
// Companies
// ---------------------------------------------------------------

const createCompanySchema = z.object({
  companyName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
});

superAdminRouter.post('/companies', async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await createCompanyWithAdmin(parsed.data);
    res.status(201).json(result);
  } catch (e: any) {
    if (e.message === 'SLUG_TAKEN')
      return res.status(409).json({ error: 'Company name already exists' });
    if (e.message === 'ADMIN_EMAIL_TAKEN')
      return res.status(409).json({ error: 'Admin email already in use' });
    console.error('Create company failed:', e);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

superAdminRouter.get('/companies', async (_req, res) => {
  const companies = await listCompanies();
  res.json({ data: companies });
});

superAdminRouter.get('/companies/:id', async (req, res) => {
  try {
    const company = await getCompanyById(req.params.id);
    res.json(company);
  } catch (e: any) {
    if (e.message === 'COMPANY_NOT_FOUND')
      return res.status(404).json({ error: 'Company not found' });
    res.status(500).json({ error: 'Failed to load company' });
  }
});

const updateCompanySchema = z.object({
  name: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

superAdminRouter.patch('/companies/:id', async (req, res) => {
  const parsed = updateCompanySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const company = await updateCompany(req.params.id, parsed.data);
    res.json(company);
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to update company' });
  }
});

superAdminRouter.delete('/companies/:id', async (req, res) => {
  try {
    await deleteCompany(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// ---------------------------------------------------------------
// Company admins
// ---------------------------------------------------------------

superAdminRouter.get('/companies/:id/admins', async (req, res) => {
  const admins = await listCompanyAdmins(req.params.id);
  res.json({ data: admins });
});

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

superAdminRouter.post('/companies/:id/admins', async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const admin = await createCompanyAdmin({
      companyId: req.params.id,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    res.status(201).json(admin);
  } catch (e: any) {
    if (e.message === 'COMPANY_NOT_FOUND')
      return res.status(404).json({ error: 'Company not found' });
    if (e.message === 'EMAIL_TAKEN')
      return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

superAdminRouter.delete('/admins/:id', async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    if (e.message === 'USER_NOT_FOUND')
      return res.status(404).json({ error: 'User not found' });
    if (e.message === 'LAST_ADMIN')
      return res.status(409).json({ error: 'Cannot delete the last admin of a company' });
    res.status(500).json({ error: 'Failed to delete user' });
  }
});