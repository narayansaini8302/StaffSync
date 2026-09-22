import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  createDevice,
  listDevices,
  rotateDeviceKey,
  deactivateDevice,
} from './device.service';

export const deviceRouter = Router();
deviceRouter.use(requireAuth, requireRole('ADMIN'));

const createSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional(),
  type: z.enum(['CAMERA', 'FINGERPRINT', 'MOBILE', 'WEB']).optional(),
});

deviceRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const result = await createDevice(req.user!.companyId, parsed.data);
  res.status(201).json(result);
});

deviceRouter.get('/', async (req, res) => {
  const devices = await listDevices(req.user!.companyId);
  res.json({ data: devices });
});

deviceRouter.post('/:id/rotate', async (req, res) => {
  try {
    const result = await rotateDeviceKey(req.user!.companyId, req.params.id);
    res.json(result);
  } catch (e: any) {
    if (e.message === 'DEVICE_NOT_FOUND')
      return res.status(404).json({ error: 'Device not found' });
    res.status(500).json({ error: 'Failed to rotate key' });
  }
});

deviceRouter.delete('/:id', async (req, res) => {
  try {
    const device = await deactivateDevice(req.user!.companyId, req.params.id);
    res.json(device);
  } catch (e: any) {
    if (e.message === 'DEVICE_NOT_FOUND')
      return res.status(404).json({ error: 'Device not found' });
    res.status(500).json({ error: 'Failed to deactivate device' });
  }
});