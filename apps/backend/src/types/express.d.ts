// apps/backend/src/types/express.d.ts
import { TokenPayload, SuperAdminTokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      superAdmin?: SuperAdminTokenPayload;
      device?: {
        id: string;
        name?: string;
        companyId: string;
      };
    }
  }
}

export {};