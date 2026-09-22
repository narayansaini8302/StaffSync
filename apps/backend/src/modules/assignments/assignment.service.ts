import { prisma } from '../../config/prisma';

export interface CreateAssignmentInput {
  clientId: string;
  employeeId: string;
  startDate: string;
  endDate?: string;
}

export interface UpdateAssignmentInput {
  startDate?: string;
  endDate?: string | null;
  isActive?: boolean;
}

export async function createAssignment(
  companyId: string,
  input: CreateAssignmentInput,
) {
  // Verify both the client and employee belong to this company
  const [client, employee] = await Promise.all([
    prisma.client.findFirst({ where: { id: input.clientId, companyId } }),
    prisma.employee.findFirst({ where: { id: input.employeeId, companyId } }),
  ]);
  if (!client) throw new Error('CLIENT_NOT_FOUND');
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  return prisma.employeeAssignment.create({
    data: {
      clientId: input.clientId,
      employeeId: input.employeeId,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
  });
}

export async function listAssignments(companyId: string, clientId?: string) {
  return prisma.employeeAssignment.findMany({
    where: {
      client: { companyId },
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true } },
      // Manual join to Employee since there's no relation defined
    },
  });
}

/**
 * List assignments with employee details joined in.
 * We do a second query since there is no Prisma relation between
 * EmployeeAssignment.employeeId and Employee.
 */
export async function listAssignmentsWithEmployees(
  companyId: string,
  clientId?: string,
) {
  const assignments = await prisma.employeeAssignment.findMany({
    where: {
      client: { companyId },
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, gstin: true } },
    },
  });

  const employeeIds = [...new Set(assignments.map((a) => a.employeeId))];
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, companyId },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      category: true,
      isActive: true,
    },
  });
  const empMap = new Map(employees.map((e) => [e.id, e]));

  return assignments.map((a) => ({
    ...a,
    employee: empMap.get(a.employeeId) ?? null,
  }));
}

export async function updateAssignment(
  companyId: string,
  id: string,
  input: UpdateAssignmentInput,
) {
  // Verify assignment's client belongs to this company
  const existing = await prisma.employeeAssignment.findFirst({
    where: { id, client: { companyId } },
  });
  if (!existing) throw new Error('ASSIGNMENT_NOT_FOUND');

  const data: any = {};
  if (input.startDate !== undefined) data.startDate = new Date(input.startDate);
  if (input.endDate !== undefined)
    data.endDate = input.endDate ? new Date(input.endDate) : null;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return prisma.employeeAssignment.update({ where: { id }, data });
}

export async function deleteAssignment(companyId: string, id: string) {
  const existing = await prisma.employeeAssignment.findFirst({
    where: { id, client: { companyId } },
  });
  if (!existing) throw new Error('ASSIGNMENT_NOT_FOUND');

  return prisma.employeeAssignment.delete({ where: { id } });
}