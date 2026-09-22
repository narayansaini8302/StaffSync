import { Router } from 'express';
import { z } from 'zod';
import { superAdminLogin } from './super-admin.service';
import { requireSuperAdmin } from '../../middleware/auth';

export const superAdminAuthRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

superAdminAuthRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await superAdminLogin(parsed.data.email, parsed.data.password);
    res.json(result);
  } catch {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

superAdminAuthRouter.get('/me', requireSuperAdmin, async (req, res) => {
  res.json({ superAdmin: req.superAdmin });
});