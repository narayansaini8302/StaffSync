import { Router } from 'express';
import { z } from 'zod';
import { registerUser, loginUser, refreshTokens } from './auth.service';
import { requireAuth } from '../../middleware/auth';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']).optional(),
  companyId: z.string().uuid(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const user = await registerUser(parsed.data);
    res.status(201).json({
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    });
  } catch (e: any) {
    if (e.message === 'EMAIL_IN_USE')
      return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: 'Registration failed' });
  }
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    res.json(result);
  } catch {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });
  try {
    const tokens = await refreshTokens(refreshToken);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});