import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';

function hashKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

/**
 * Device auth for kiosk endpoints.
 * Reads the `X-Device-Key` header (the plaintext key shown once when the
 * device was created in the Devices page). Hashes it and looks up the
 * matching device_api_keys row.
 */
export async function requireDevice(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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

// Keep requireKiosk as an alias
export const requireKiosk = requireDevice;