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
  let status = 'ABSENT';
  if (roundedHours >= 6) {
    status = 'PRESENT';
  } else if (roundedHours >= 3) {
    status = 'HALF_DAY';
  } else {
    status = 'ABSENT';
  }

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
// Manual Attendance System (Full Day: 8h, Half Day: 4h, Absent: 0h)
// ---------------------------------------------------------------------------

export interface MarkManualAttendanceInput {
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE';
  hours?: number;
  notes?: string;
}

export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export async function markManualAttendance(
  companyId: string,
  input: MarkManualAttendanceInput,
) {
  const employee = await prisma.employee.findFirst({
    where: { id: input.employeeId, companyId },
  });
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  const dayDate = parseDateOnly(input.date);

  // Standard: Full Day = 8 hours (480 mins), Half Day = 4 hours (240 mins), Absent/Leave = 0 mins
  let totalMinutes = 0;
  if (input.status === 'PRESENT') {
    totalMinutes = input.hours != null ? Math.round(input.hours * 60) : 480;
  } else if (input.status === 'HALF_DAY') {
    totalMinutes = input.hours != null ? Math.round(input.hours * 60) : 240;
  } else {
    totalMinutes = 0;
  }

  let firstIn: Date | null = null;
  let lastOut: Date | null = null;
  if (input.status === 'PRESENT' || input.status === 'HALF_DAY') {
    firstIn = new Date(dayDate.getTime() + 9 * 3600000); // 09:00 UTC
    lastOut = new Date(firstIn.getTime() + totalMinutes * 60000);
  }

  const day = await prisma.attendanceDay.upsert({
    where: {
      employeeId_date: {
        employeeId: input.employeeId,
        date: dayDate,
      },
    },
    create: {
      employeeId: input.employeeId,
      companyId,
      date: dayDate,
      status: input.status,
      totalMinutes,
      overtimeMins: 0,
      lateMins: 0,
      firstIn,
      lastOut,
    },
    update: {
      status: input.status,
      totalMinutes,
      firstIn,
      lastOut,
    },
  });

  // Create audit log for transparency
  await prisma.attendanceLog.create({
    data: {
      employeeId: input.employeeId,
      companyId,
      timestamp: new Date(),
      direction: input.status === 'ABSENT' ? 'OUT' : 'IN',
      source: 'MANUAL',
      notes:
        input.notes ||
        `Manual: ${input.status} (${(totalMinutes / 60).toFixed(1)}h)`,
    },
  });

  return day;
}

export async function markBulkAttendance(
  companyId: string,
  input: {
    date: string;
    entries: Array<{
      employeeId: string;
      status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE';
      hours?: number;
      notes?: string;
    }>;
  },
) {
  const results = [];
  for (const entry of input.entries) {
    try {
      const res = await markManualAttendance(companyId, {
        employeeId: entry.employeeId,
        date: input.date,
        status: entry.status,
        hours: entry.hours,
        notes: entry.notes,
      });
      results.push({ employeeId: entry.employeeId, success: true, day: res });
    } catch (e: any) {
      results.push({
        employeeId: entry.employeeId,
        success: false,
        error: e.message,
      });
    }
  }
  return { updated: results.filter((r) => r.success).length, results };
}

export async function markAllActiveEmployees(
  companyId: string,
  input: {
    date: string;
    status: 'PRESENT' | 'HALF_DAY' | 'ABSENT';
    notes?: string;
  },
) {
  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  });

  const entries = employees.map((emp) => ({
    employeeId: emp.id,
    status: input.status,
    notes: input.notes,
  }));

  return markBulkAttendance(companyId, {
    date: input.date,
    entries,
  });
}

export async function getDailySheet(companyId: string, dateStr: string) {
  const dayDate = parseDateOnly(dateStr);

  const [employees, attendanceDays] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        email: true,
        category: true,
        employmentType: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.attendanceDay.findMany({
      where: {
        companyId,
        date: dayDate,
      },
    }),
  ]);

  const dayMap = new Map(attendanceDays.map((d) => [d.employeeId, d]));

  let presentCount = 0;
  let halfDayCount = 0;
  let absentCount = 0;
  let leaveCount = 0;
  let totalMinutes = 0;

  const rows = employees.map((emp) => {
    const record = dayMap.get(emp.id) || null;
    if (record) {
      if (record.status === 'PRESENT') presentCount += 1;
      else if (record.status === 'HALF_DAY') halfDayCount += 1;
      else if (record.status === 'ABSENT') absentCount += 1;
      else if (record.status === 'LEAVE') leaveCount += 1;
      totalMinutes += record.totalMinutes;
    }

    return {
      ...emp,
      attendance: record
        ? {
            id: record.id,
            status: record.status,
            totalMinutes: record.totalMinutes,
            hours: Math.round((record.totalMinutes / 60) * 10) / 10,
            firstIn: record.firstIn,
            lastOut: record.lastOut,
            updatedAt: record.updatedAt,
          }
        : null,
    };
  });

  const markedCount = attendanceDays.length;
  const unmarkedCount = employees.length - markedCount;

  return {
    date: dateStr,
    stats: {
      totalEmployees: employees.length,
      markedCount,
      unmarkedCount: Math.max(0, unmarkedCount),
      presentCount, // Full day (8h)
      halfDayCount, // Half day (4h)
      absentCount, // Absent (0h)
      leaveCount,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    },
    employees: rows,
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