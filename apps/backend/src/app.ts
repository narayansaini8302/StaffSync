import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './modules/auth/auth.routes';
import { employeeRouter } from './modules/employees/employee.routes';
import { attendanceRouter } from './modules/attendance/attendance.routes';
import { payrollRouter } from './modules/payroll/payroll.routes';
import { superAdminAuthRouter } from './modules/super-admin/super-admin.auth.routes';
import { superAdminRouter } from './modules/super-admin/super-admin.routes';
import { clientRouter } from './modules/clients/client.routes';
import { companyRouter } from './modules/company/company.routes';
import { assignmentRouter } from './modules/assignments/assignment.routes';
import { invoiceRouter } from './modules/invoices/invoice.routes';
import { errorHandler } from './middleware/error';
import path from 'path';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const allowedExactOrigins = [
          'https://staff-sync-frontend-six.vercel.app',
          'http://localhost:3000',
          'http://localhost:5173',
        ];

        if (process.env.FRONTEND_URL) {
          allowedExactOrigins.push(process.env.FRONTEND_URL);
        }
        if (process.env.CORS_ORIGIN) {
          allowedExactOrigins.push(...process.env.CORS_ORIGIN.split(',').map((o) => o.trim()));
        }

        const isAllowed =
          allowedExactOrigins.includes(origin) ||
          /^https:\/\/staff-sync-frontend.*\.vercel\.app$/.test(origin) ||
          /^https:\/\/.*\.vercel\.app$/.test(origin) ||
          /^http:\/\/localhost:\d+$/.test(origin);

        if (isAllowed) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
    }),
  );

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  app.use(morgan('dev'));

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'StaffSync Backend API', timestamp: new Date().toISOString() });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/super-admin/auth', superAdminAuthRouter);
  app.use('/api/super-admin', superAdminRouter);
  app.use('/api/clients', clientRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/assignments', assignmentRouter);
    app.use('/api/invoices', invoiceRouter);
  app.use('/api/employees', employeeRouter);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/payroll', payrollRouter);

  app.use(errorHandler);

  return app;
}







