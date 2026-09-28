import { prisma } from '../../config/prisma';

export interface CreateClientInput {
  name: string;
  gstin?: string;
  address: string;
  email?: string;
  phone?: string;
  stateCode?: string;
}

export interface UpdateClientInput extends Partial<CreateClientInput> { }

export interface ClientRateInput {
  category: 'HOUSEKEEPING' | 'SEMI_SKILLED' | 'SECURITY_GUARD' | 'SUPERVISOR';
  hourlyRate: number;
}

// ---------------------------------------------------------------------------

export async function createClient(companyId: string, input: CreateClientInput) {
  return prisma.client.create({
    data: {
      name: input.name.trim(),
      gstin: input.gstin?.trim() || null,
      address: input.address.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      stateCode: input.stateCode?.trim() || null,
      companyId,
    },
  });
}

export async function listClients(companyId: string) {
  return prisma.client.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { assignments: true, invoices: true },
      },
    },
  });
}

export async function getClientById(companyId: string, id: string) {
  return prisma.client.findFirst({
    where: { id, companyId },
    include: {
      rateOverrides: { orderBy: { category: 'asc' } },
      _count: { select: { assignments: true, invoices: true } },
    },
  });
}

export async function updateClient(
  companyId: string,
  id: string,
  input: UpdateClientInput,
) {
  const existing = await prisma.client.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('CLIENT_NOT_FOUND');

  const data: any = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.gstin !== undefined) data.gstin = input.gstin?.trim() || null;
  if (input.address !== undefined) data.address = input.address.trim();
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.stateCode !== undefined) data.stateCode = input.stateCode?.trim() || null;

  return prisma.client.update({ where: { id }, data });
}

export async function deleteClient(companyId: string, id: string) {
  const existing = await prisma.client.findFirst({ where: { id, companyId } });
  if (!existing) throw new Error('CLIENT_NOT_FOUND');
  return prisma.client.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Client-specific rate overrides
// ---------------------------------------------------------------------------

export async function setClientRate(
  companyId: string,
  clientId: string,
  input: ClientRateInput,
) {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId } });
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  return prisma.clientCategoryRate.upsert({
    where: {
      clientId_category: { clientId, category: input.category },
    },
    create: {
      clientId,
      category: input.category,
      hourlyRate: input.hourlyRate,
    },
    update: {
      hourlyRate: input.hourlyRate,
    },
  });
}

export async function removeClientRate(
  companyId: string,
  clientId: string,
  category: 'HOUSEKEEPING' | 'SEMI_SKILLED' | 'SECURITY_GUARD' | 'SUPERVISOR',
) {
  const client = await prisma.client.findFirst({ where: { id: clientId, companyId } });
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  return prisma.clientCategoryRate.delete({
    where: { clientId_category: { clientId, category } },
  });
}