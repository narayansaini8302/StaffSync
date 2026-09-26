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
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
   app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  app.use(morgan('dev'));

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







