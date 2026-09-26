import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  recordScan,
  listLogs,
  listDaily,
  deleteLog,
  editLog,
  markManualAttendance,
  markBulkAttendance,
  markAllActiveEmployees,
  getDailySheet,
} from './attendance.service';

export const attendanceRouter = Router();

// ---------------------------------------------------------------------------
// Admin-only: record a manual scan
// ---------------------------------------------------------------------------

const scanSchema = z.object({
  employeeId: z.string().uuid(),
  timestamp: z.string().datetime().optional(),
  source: z.enum(['FACE', 'FINGERPRINT', 'CARD', 'PIN', 'MANUAL', 'MOBILE']),
  deviceId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  scanId: z.string().min(1).optional(),
  direction: z.enum(['IN', 'OUT']).optional(),
  notes: z.string().optional(),
});

attendanceRouter.post(
  '/log',
  requireAuth,
  requireRole('ADMIN', 'HR', 'MANAGER'),
  async (req, res) => {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    try {
      const result = await recordScan(req.user!.companyId, parsed.data);
      res.status(201).json(result);
    } catch (e: any) {
      if (e.message === 'EMPLOYEE_NOT_FOUND')
        return res.status(404).json({ error: 'Employee not found' });
      if (e?.code === 'P2002')
        return res.status(200).json({ error: 'Duplicate scanId', duplicate: true });
      if (e?.code === 'P2003')
        return res.status(404).json({ error: 'Employee not found' });
      console.error('recordScan error:', e); res.status(500).json({ error: 'Failed to record scan', detail: e.message, code: e?.code });
    }
  },
);

// ---------------------------------------------------------------------------
// Authenticated: list logs + daily aggregates
// ---------------------------------------------------------------------------

attendanceRouter.get('/logs', requireAuth, async (req, res) => {
  const result = await listLogs(req.user!.companyId, {
    employeeId: req.query.employeeId as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    direction: req.query.direction as 'IN' | 'OUT' | undefined,
    source: req.query.source as any,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

attendanceRouter.get('/daily', requireAuth, async (req, res) => {
  const result = await listDaily(req.user!.companyId, {
    employeeId: req.query.employeeId as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
  });
  res.json(result);
});

// ---------------------------------------------------------------------------
// Manual Attendance Endpoints (Full Day: 8h, Half Day: 4h, Absent: 0h)
// ---------------------------------------------------------------------------

const manualAttendanceSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  status: z.enum(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE']),
  hours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
});

const bulkAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  entries: z.array(
    z.object({
      employeeId: z.string().uuid(),
      status: z.enum(['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE']),
      hours: z.number().min(0).max(24).optional(),
      notes: z.string().optional(),
    }),
  ),
});

const quickAllSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  status: z.enum(['PRESENT', 'HALF_DAY', 'ABSENT']),
  notes: z.string().optional(),
});

attendanceRouter.get(
  '/daily-sheet',
  requireAuth,
  requireRole('ADMIN', 'HR', 'MANAGER'),
  async (req, res) => {
    try {
      const dateStr =
        (req.query.date as string) ||
        new Date().toISOString().slice(0, 10);
      const result = await getDailySheet(req.user!.companyId, dateStr);
      res.json(result);
    } catch (e: any) {
      console.error('getDailySheet error:', e);
      res.status(500).json({ error: 'Failed to fetch daily attendance sheet', detail: e.message });
    }
  },
);

attendanceRouter.post(
  '/manual',
  requireAuth,
  requireRole('ADMIN', 'HR', 'MANAGER'),
  async (req, res) => {
    const parsed = manualAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      const result = await markManualAttendance(req.user!.companyId, parsed.data);
      res.status(200).json({ ok: true, day: result });
    } catch (e: any) {
      if (e.message === 'EMPLOYEE_NOT_FOUND') {
        return res.status(404).json({ error: 'Employee not found' });
      }
      console.error('markManualAttendance error:', e);
      res.status(500).json({ error: 'Failed to mark attendance', detail: e.message });
    }
  },
);

attendanceRouter.post(
  '/manual/bulk',
  requireAuth,
  requireRole('ADMIN', 'HR', 'MANAGER'),
  async (req, res) => {
    const parsed = bulkAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      const result = await markBulkAttendance(req.user!.companyId, parsed.data);
      res.status(200).json({ ok: true, ...result });
    } catch (e: any) {
      console.error('markBulkAttendance error:', e);
      res.status(500).json({ error: 'Failed to mark bulk attendance', detail: e.message });
    }
  },
);

attendanceRouter.post(
  '/manual/quick-all',
  requireAuth,
  requireRole('ADMIN', 'HR', 'MANAGER'),
  async (req, res) => {
    const parsed = quickAllSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    try {
      const result = await markAllActiveEmployees(req.user!.companyId, parsed.data);
      res.status(200).json({ ok: true, ...result });
    } catch (e: any) {
      console.error('markAllActiveEmployees error:', e);
      res.status(500).json({ error: 'Failed to mark quick-all attendance', detail: e.message });
    }
  },
);

// ---------------------------------------------------------------------------
// Admin editing â€” delete and edit logs
// ---------------------------------------------------------------------------

attendanceRouter.delete(
  '/logs/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    try {
      const result = await deleteLog(req.user!.companyId, String(req.params.id) as string);
      res.json(result);
    } catch (e: any) {
      if (e.message === 'LOG_NOT_FOUND')
        return res.status(404).json({ error: 'Log not found' });
      console.error(e);
      res.status(500).json({ error: 'Delete failed' });
    }
  },
);

attendanceRouter.patch(
  '/logs/:id',
  requireAuth,
  requireRole('ADMIN'),
  async (req, res) => {
    const { timestamp, direction } = req.body ?? {};
    if (timestamp && typeof timestamp !== 'string') {
      return res.status(400).json({ error: 'timestamp must be ISO string' });
    }
    if (direction && direction !== 'IN' && direction !== 'OUT') {
      return res.status(400).json({ error: 'direction must be IN or OUT' });
    }
    try {
      const result = await editLog(req.user!.companyId, String(req.params.id) as string, {
        timestamp,
        direction,
      });
      res.json(result);
    } catch (e: any) {
      if (e.message === 'LOG_NOT_FOUND')
        return res.status(404).json({ error: 'Log not found' });
      console.error(e);
      res.status(500).json({ error: 'Edit failed' });
    }
  },
);