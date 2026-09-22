import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../middleware/auth';
import { requireKiosk as requireDevice } from '../../middleware/kiosk';
import { enrollFace, recognizeFace, listEnrolled } from './face.service';
import { recordScan } from '../attendance/attendance.service';
import { prisma } from '../../config/prisma';

export const faceRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ---------------------------------------------------------------------------
// POST /api/face/enroll — ADMIN or HR (user token)
// ---------------------------------------------------------------------------
faceRouter.post(
  '/enroll',
  requireAuth,
  requireRole('ADMIN', 'HR'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Missing file field "file"' });

    const employeeId = req.body.employeeId;
    if (!employeeId) return res.status(400).json({ error: 'Missing employeeId' });

    try {
      const result = await enrollFace(
        req.user!.companyId,
        employeeId,
        req.file.buffer,
        req.file.originalname,
      );
      res.status(201).json(result);
    } catch (e: any) {
      console.error('Enroll failed:', e);
      if (e.message === 'EMPLOYEE_NOT_FOUND')
        return res.status(404).json({ error: 'Employee not found' });
      if (String(e.message).startsWith('FACE_SERVICE_ERROR')) {
        return res.status(422).json({ error: 'Face detection failed', detail: e.message });
      }
      res.status(500).json({ error: 'Enrollment failed', detail: e.message });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/face/scan — device-key auth
// ---------------------------------------------------------------------------
faceRouter.post(
  '/scan',
  requireDevice,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Missing file field "file"' });

    try {
      const result = await recognizeFace(req.file.buffer, req.file.originalname);

      if (!result.matched || !result.employeeId) {
        return res.status(200).json({
          matched: false,
          reason: result.reason ?? 'no match',
          bestGuess: result.bestGuess,
          distance: result.distance,
        });
      }

      const companyId = req.device!.companyId;

      // Verify employee belongs to the device's company
      const emp = await prisma.employee.findFirst({
        where: { id: result.employeeId, companyId },
      });
      if (!emp) {
        return res.status(200).json({
          matched: false,
          reason: 'Employee not in this company',
        });
      }

      const scan = await recordScan(companyId, {
        employeeId: result.employeeId,
        source: 'FACE',
        deviceId: req.device?.id,
        confidence: result.confidence,
        scanId: req.body.scanId,
      });

      res.status(201).json({
        matched: true,
        confidence: result.confidence,
        distance: result.distance,
        log: scan.log,
        day: scan.day,
        deduplicated: scan.deduplicated,
      });
    } catch (e: any) {
      console.error('Scan failed:', e);
      res.status(500).json({ error: 'Scan failed', detail: e.message });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/face/enrolled — ADMIN or HR
// ---------------------------------------------------------------------------
faceRouter.get(
  '/enrolled',
  requireAuth,
  requireRole('ADMIN', 'HR'),
  async (req, res) => {
    const rows = await listEnrolled(req.user!.companyId);
    res.json({ data: rows });
  },
);