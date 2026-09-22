import { prisma } from '../../config/prisma';
import { attendanceConfig } from '../../config/attendance';
import { LogDirection, LogSource, Prisma } from '@prisma/client';

export interface RecordScanInput {
  employeeId: string;
  timestamp?: string;
  source: 'FACE' | 'FINGERPRINT' | 'CARD' | 'PIN' | 'MANUAL' | 'MOBILE';
  deviceId?: string;
  confidence?: number;
  scanId?: string;
  direction?: 'IN' | 'OUT';
  notes?: string;
}

export interface ListLogsQuery {
  employeeId?: string;
  from?: string;
  to?: string;
  direction?: 'IN' | 'OUT';
  source?: LogSource;
  page?: number;
  pageSize?: number;
}

export interface ListDailyQuery {
  employeeId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// recordScan — companyId is REQUIRED. It's derived from the employee.
// ---------------------------------------------------------------------------

export async function recordScan(companyId: string, input: RecordScanInput) {
  // Verify the employee belongs to this company before recording anything
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId },
  });
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  if (input.scanId) {
    const existing = await prisma.attendanceLog.findUnique({
      where: { scanId: input.scanId },
    });
    if (existing) {
      return {
        log: existing,
        day: await getDayAggregate(companyId, existing.employeeId, existing.timestamp),
        deduplicated: true,
      };
    }
  }

  const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();
  const dayStart = startOfDay(timestamp);

  // Debounce: ignore scans within 30s of the last one for this employee
  if (!input.scanId) {
    const thirtySecondsAgo = new Date(timestamp.getTime() - 30_000);
    const recentLog = await prisma.attendanceLog.findFirst({
      where: {
        employeeId: input.employeeId,
        companyId,
        timestamp: { gte: thirtySecondsAgo, lte: timestamp },
      },
      orderBy: { timestamp: 'desc' },
    });
    if (recentLog) {
      return {
        log: recentLog,
        day: await getDayAggregate(companyId, input.employeeId, recentLog.timestamp),
        deduplicated: true,
      };
    }
  }

  const lastLog = await prisma.attendanceLog.findFirst({
    where: {
      employeeId: input.employeeId,
      companyId,
      timestamp: { gte: dayStart, lt: addDays(dayStart, 1) },
    },
    orderBy: { timestamp: 'desc' },
  });

  const direction: LogDirection =
    input.direction ?? (lastLog?.direction === 'IN' ? 'OUT' : 'IN');

  const log = await prisma.attendanceLog.create({
    data: {
      employeeId: input.employeeId,
      companyId,
      timestamp,
      direction,
      source: input.source as LogSource,
      deviceId: input.deviceId,
      confidence: input.confidence,
      scanId: input.scanId,
      notes: input.notes,
    },
  });

  const day = await recomputeDay(companyId, input.employeeId, timestamp);
  return { log, day, deduplicated: false };
}

// ---------------------------------------------------------------------------
// recomputeDay — recalculates the aggregate for a specific employee + day
// ---------------------------------------------------------------------------

export async function recomputeDay(
  companyId: string,
  employeeId: string,
  referenceTime: Date,
) {
  const dayStart = startOfDay(referenceTime);
  const dayEnd = addDays(dayStart, 1);

  const logs = await prisma.attendanceLog.findMany({
    where: {
      employeeId,
      companyId,
      timestamp: { gte: dayStart, lt: dayEnd },
    },
    orderBy: { timestamp: 'asc' },
  });

  if (logs.length === 0) {
    return prisma.attendanceDay.upsert({
      where: { employeeId_date: { employeeId, date: dayStart } },
      create: { employeeId, companyId, date: dayStart, status: 'ABSENT' },
      update: {
        status: 'ABSENT',
        firstIn: null,
        lastOut: null,
        totalMinutes: 0,
        overtimeMins: 0,
        lateMins: 0,
      },
    });
  }

  const firstIn = logs.find((l) => l.direction === 'IN')?.timestamp ?? null;
  const lastOut = [...logs].reverse().find((l) => l.direction === 'OUT')?.timestamp ?? null;

  let rawMinutes = 0;
  let openIn: Date | null = null;
  for (const log of logs) {
    if (log.direction === 'IN') {
      openIn = log.timestamp;
    } else if (log.direction === 'OUT' && openIn) {
      rawMinutes += Math.round(
        (log.timestamp.getTime() - openIn.getTime()) / 60000,
      );
      openIn = null;
    }
  }

   // Round to nearest hour (30+ min → up)
  const roundedHours = Math.round(rawMinutes / 60);
  const totalMinutes = roundedHours * 60;
  const overtimeMins = 0;   // No overtime tracking
  const lateMins = 0;       // No late tracking
  const status = 'PRESENT';

  return prisma.attendanceDay.upsert({
    where: { employeeId_date: { employeeId, date: dayStart } },
    create: {
      employeeId,
      companyId,
      date: dayStart,
      firstIn,
      lastOut,
      totalMinutes,
      overtimeMins,
      lateMins,
      status,
    },
    update: {
      firstIn,
      lastOut,
      totalMinutes,
      overtimeMins,
      lateMins,
      status,
    },
  });
}

export async function getDayAggregate(
  companyId: string,
  employeeId: string,
  referenceTime: Date,
) {
  const dayStart = startOfDay(referenceTime);
  return prisma.attendanceDay.findFirst({
    where: { employeeId, companyId, date: dayStart },
  });
}

// ---------------------------------------------------------------------------
// listLogs
// ---------------------------------------------------------------------------

export async function listLogs(companyId: string, query: ListLogsQuery) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));

  const where: Prisma.AttendanceLogWhereInput = { companyId };
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.direction) where.direction = query.direction;
  if (query.source) where.source = query.source;
  if (query.from || query.to) {
    where.timestamp = {};
    if (query.from) (where.timestamp as any).gte = new Date(query.from);
    if (query.to) (where.timestamp as any).lte = new Date(query.to);
  }

  const [data, total] = await Promise.all([
    prisma.attendanceLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { timestamp: 'desc' },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    }),
    prisma.attendanceLog.count({ where }),
  ]);

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// ---------------------------------------------------------------------------
// listDaily
// ---------------------------------------------------------------------------

export async function listDaily(companyId: string, query: ListDailyQuery) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));

  const where: Prisma.AttendanceDayWhereInput = { companyId };
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.from || query.to) {
    where.date = {};
    if (query.from) (where.date as any).gte = startOfDay(new Date(query.from));
    if (query.to) (where.date as any).lte = startOfDay(new Date(query.to));
  }

  const [data, total] = await Promise.all([
    prisma.attendanceDay.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { date: 'desc' },
    }),
    prisma.attendanceDay.count({ where }),
  ]);

  return {
    data,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

// ---------------------------------------------------------------------------
// Kiosk + admin editing
// ---------------------------------------------------------------------------

export async function kioskPunch(
  companyId: string,
  imageBuffer: Buffer,
  direction: 'IN' | 'OUT',
  faceServiceUrl: string,
) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(imageBuffer)]), 'punch.jpg');

  const res = await fetch(`${faceServiceUrl}/recognize`, {
    method: 'POST',
    body: form as any,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 422) {
      return { ok: false as const, error: 'No face detected. Position yourself and try again.' };
    }
    return { ok: false as const, error: `Face service error: ${res.status}`, detail: text };
  }

  const match = (await res.json()) as {
    matched: boolean;
    employeeId?: string;
    confidence?: number;
    distance?: number;
    reason?: string;
    bestGuess?: string;
    error?: string;
  };

  if (match.reason === 'liveness_failed') {
    return {
      ok: false as const,
      error: match.error ?? 'Liveness check failed. Please look directly at the camera.',
    };
  }

  if (!match.matched || !match.employeeId) {
    return {
      ok: false as const,
      error: 'Face not recognized. Ask your admin to enroll your face.',
      bestGuess: match.bestGuess,
    };
  }

  // Verify the matched employee belongs to this company
  const employee = await prisma.employee.findFirst({
    where: { id: match.employeeId, companyId },
  });
  if (!employee || !employee.isActive) {
    return { ok: false as const, error: 'Your account is inactive or not in this company.' };
  }

  // Enforce one IN + one OUT per day
  const todayStart = startOfDay(new Date());
  const tomorrow = addDays(todayStart, 1);

  const existingIn = await prisma.attendanceLog.findFirst({
    where: {
      employeeId: employee.id,
      companyId,
      direction: 'IN',
      timestamp: { gte: todayStart, lt: tomorrow },
    },
    orderBy: { timestamp: 'asc' },
  });

  const existingOut = await prisma.attendanceLog.findFirst({
    where: {
      employeeId: employee.id,
      companyId,
      direction: 'OUT',
      timestamp: { gte: todayStart, lt: tomorrow },
    },
    orderBy: { timestamp: 'desc' },
  });

  if (direction === 'IN' && existingIn) {
    return {
      ok: false as const,
      error: `You already checked IN today at ${existingIn.timestamp.toLocaleTimeString()}. Please use CHECK OUT.`,
    };
  }
  if (direction === 'OUT' && existingOut) {
    return {
      ok: false as const,
      error: `You already checked OUT today at ${existingOut.timestamp.toLocaleTimeString()}. See you tomorrow!`,
    };
  }
  if (direction === 'OUT' && !existingIn) {
    return {
      ok: false as const,
      error: "You haven't checked IN yet today. Please use CHECK IN first.",
    };
  }

  const result = await recordScan(companyId, {
    employeeId: employee.id,
    source: 'FACE',
    direction,
    confidence: match.confidence,
  });

  return {
    ok: true as const,
    log: result.log,
    day: result.day,
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      code: employee.employeeCode,
    },
  };
}

export async function deleteLog(companyId: string, id: string) {
  const log = await prisma.attendanceLog.findFirst({ where: { id, companyId } });
  if (!log) throw new Error('LOG_NOT_FOUND');

  await prisma.attendanceLog.delete({ where: { id } });
  const day = await recomputeDay(companyId, log.employeeId, log.timestamp);
  return { deleted: log, day };
}

export async function editLog(
  companyId: string,
  id: string,
  patch: { timestamp?: string; direction?: 'IN' | 'OUT' },
) {
  const log = await prisma.attendanceLog.findFirst({ where: { id, companyId } });
  if (!log) throw new Error('LOG_NOT_FOUND');

  const updated = await prisma.attendanceLog.update({
    where: { id },
    data: {
      ...(patch.timestamp ? { timestamp: new Date(patch.timestamp) } : {}),
      ...(patch.direction ? { direction: patch.direction } : {}),
    },
  });

  const oldDay = await recomputeDay(companyId, log.employeeId, log.timestamp);
  const newDay =
    patch.timestamp &&
    startOfDay(new Date(patch.timestamp)).getTime() !== startOfDay(log.timestamp).getTime()
      ? await recomputeDay(companyId, updated.employeeId, updated.timestamp)
      : oldDay;

  return { log: updated, day: newDay };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}