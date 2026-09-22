import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth';
import { requireKiosk } from '../../middleware/kiosk';
import {
  recordScan,
  listLogs,
  listDaily,
  kioskPunch,
  deleteLog,
  editLog,
} from './attendance.service';

export const attendanceRouter = Router();

const kioskUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? 'http://localhost:5000';

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
// Kiosk punch — public, authenticated by X-Device-Key
//
// The kiosk is device-driven, so `companyId` comes from the device record.
// We attach it in the kiosk middleware (see src/middleware/kiosk.ts).
// ---------------------------------------------------------------------------

attendanceRouter.post(
  '/kiosk/punch',
  requireKiosk,
  kioskUpload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Missing file field "file"' });
    }

    const direction = req.body.direction;
    if (direction !== 'IN' && direction !== 'OUT') {
      return res.status(400).json({ error: 'direction must be IN or OUT' });
    }

    try {
      const result = await kioskPunch(
        req.device!.companyId,
        req.file.buffer,
        direction,
        FACE_SERVICE_URL,
      );
      const status = result.ok ? 201 : 200;
      console.log(
        '[KIOSK]',
        result.ok ? 'OK' : 'FAIL',
        direction,
        '-',
        (result as any).error ?? (result as any).reason ?? '',
      );
      res.status(status).json(result);
    } catch (e: any) {
      console.error('Kiosk punch failed:', e);
      res.status(500).json({ ok: false, error: 'Server error', detail: e.message });
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
      const result = await deleteLog(req.user!.companyId, req.params.id as string);
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
      const result = await editLog(req.user!.companyId, req.params.id as string, {
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