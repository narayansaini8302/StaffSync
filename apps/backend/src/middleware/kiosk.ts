import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      device?: { id: string; name?: string; companyId: string };
    }
  }
}

function hashKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

/**
 * Device auth for kiosk endpoints.
 * Reads the `X-Device-Key` header (the plaintext key shown once when the
 * device was created in the Devices page). Hashes it and looks up the
 * matching device_api_keys row.
 *
 * On success, attaches req.device = { id, name, companyId } — the company
 * comes from the device record, so the kiosk is automatically scoped to
 * the right tenant.
 */
export async function requireDevice(req: Request, res: Response, next: NextFunction) {
  const key = req.header('X-Device-Key');
  if (!key) {
    return res.status(401).json({ error: 'Missing X-Device-Key header' });
  }

  const keyHash = hashKey(key);

  const record = await prisma.deviceApiKey.findUnique({
    where: { keyHash },
    include: { device: true },
  });

  if (!record || !record.isActive || !record.device.isActive) {
    return res.status(401).json({ error: 'Invalid or inactive device key' });
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Device key expired' });
  }

  // Fire-and-forget last-used update
  prisma.deviceApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  req.device = {
    id: record.deviceId,
    name: record.device.name,
    companyId: record.device.companyId,
  };

  next();
}

// Keep requireKiosk as an alias for backwards compatibility (some imports may
// still reference it). Route both to the new function.
export const requireKiosk = requireDevice;