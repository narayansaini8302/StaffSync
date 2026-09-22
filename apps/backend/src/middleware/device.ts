import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma';

export function hashDeviceKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export function generateDeviceKey(): { plain: string; hash: string } {
  const plain = 'dk_' + crypto.randomBytes(24).toString('hex');
  return { plain, hash: hashDeviceKey(plain) };
}

export async function requireDeviceKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const key = req.header('X-Device-Key');
  if (!key) return res.status(401).json({ error: 'Missing X-Device-Key header' });

  const hash = hashDeviceKey(key);

  const record = await prisma.deviceApiKey.findUnique({
    where: { keyHash: hash },
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

export const requireDevice = requireDeviceKey;