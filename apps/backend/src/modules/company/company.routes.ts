import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  getCompany,
  updateCompany,
  uploadLogo,
  removeLogo,
} from './company.service';

export const companyRouter = Router();
companyRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
    if (!ok) {
      cb(new Error('Only PNG, JPG, or WebP allowed'));
    } else {
      cb(null, true);
    }
  },
});

// GET own company
companyRouter.get('/', async (req, res) => {
  try {
    const company = await getCompany(req.user!.companyId);
    res.json(company);
  } catch (e: any) {
    if (e.message === 'COMPANY_NOT_FOUND')
      return res.status(404).json({ error: 'Company not found' });
    res.status(500).json({ error: 'Failed to load company' });
  }
});

// UPDATE own company (ADMIN only)
const updateSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  website: z.string().optional(),
  stateCode: z.string().length(2).optional().or(z.literal('')),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankIfsc: z.string().optional(),
  invoicePrefix: z.string().optional(),
});

companyRouter.patch('/', requireRole('ADMIN'), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const company = await updateCompany(req.user!.companyId, parsed.data);
    res.json(company);
  } catch (e: any) {
    if (e.message === 'COMPANY_NOT_FOUND')
      return res.status(404).json({ error: 'Company not found' });
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// UPLOAD logo (ADMIN only)
companyRouter.post(
  '/logo',
  requireRole('ADMIN'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Missing file field "file"' });

    try {
      const company = await uploadLogo(
        req.user!.companyId,
        req.file.buffer,
        req.file.originalname,
      );
      res.json({ logoPath: company.logoPath });
    } catch (e: any) {
      if (e.message === 'COMPANY_NOT_FOUND')
        return res.status(404).json({ error: 'Company not found' });
      console.error(e);
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  },
);

// REMOVE logo (ADMIN only)
companyRouter.delete('/logo', requireRole('ADMIN'), async (req, res) => {
  try {
    await removeLogo(req.user!.companyId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to remove logo' });
  }
});