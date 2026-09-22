import { prisma } from '../../config/prisma';
import { generateDeviceKey } from '../../middleware/device';

export async function createDevice(
  companyId: string,
  input: {
    name: string;
    location?: string;
    type?: 'CAMERA' | 'FINGERPRINT' | 'MOBILE' | 'WEB';
  },
) {
  const device = await prisma.device.create({
    data: {
      name: input.name,
      location: input.location,
      type: input.type ?? 'CAMERA',
      companyId,
    },
  });

  const { plain, hash } = generateDeviceKey();

  await prisma.deviceApiKey.create({
    data: {
      deviceId: device.id,
      keyHash: hash,
      label: 'default',
    },
  });

  return { device, apiKey: plain };
}

export async function listDevices(companyId: string) {
  return prisma.device.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    include: {
      apiKeys: {
        select: { id: true, label: true, lastUsedAt: true, isActive: true },
      },
    },
  });
}

export async function rotateDeviceKey(companyId: string, deviceId: string, label = 'rotated') {
  const device = await prisma.device.findFirst({ where: { id: deviceId, companyId } });
  if (!device) throw new Error('DEVICE_NOT_FOUND');

  const { plain, hash } = generateDeviceKey();
  const apiKey = await prisma.deviceApiKey.create({
    data: { deviceId, keyHash: hash, label },
  });

  return { apiKeyId: apiKey.id, plain };
}

export async function deactivateDevice(companyId: string, deviceId: string) {
  const device = await prisma.device.findFirst({ where: { id: deviceId, companyId } });
  if (!device) throw new Error('DEVICE_NOT_FOUND');

  return prisma.device.update({
    where: { id: deviceId },
    data: { isActive: false },
  });
}