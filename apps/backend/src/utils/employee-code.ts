import { prisma } from '../config/prisma';

const PREFIX = 'EMP-';
const PAD = 4;

export async function generateNextEmployeeCode(): Promise<string> {
  // Find the highest existing code
  const last = await prisma.employee.findFirst({
    where: { employeeCode: { startsWith: PREFIX } },
    orderBy: { employeeCode: 'desc' },
    select: { employeeCode: true },
  });

  let nextNum = 1;
  if (last) {
    const num = parseInt(last.employeeCode.slice(PREFIX.length), 10);
    if (!isNaN(num)) nextNum = num + 1;
  }

  return `${PREFIX}${String(nextNum).padStart(PAD, '0')}`;
}

/**
 * Retry wrapper — if a concurrent create produced the same code,
 * we bump and try again (unique constraint will throw P2002).
 */
export async function withRetryOnCodeConflict<T>(
  fn: (code: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let attempt = 0;
  while (true) {
    const code = await generateNextEmployeeCode();
    try {
      return await fn(code);
    } catch (err: any) {
      const isConflict =
        err?.code === 'P2002' &&
        Array.isArray(err?.meta?.target) &&
        err.meta.target.includes('employeeCode');
      if (!isConflict || ++attempt >= maxAttempts) throw err;
    }
  }
}
