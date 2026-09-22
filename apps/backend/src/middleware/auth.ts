import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, verifySuperAdminToken, TokenPayload, SuperAdminTokenPayload } from '../utils/jwt';


export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    // Defensive: a super-admin token must never be accepted here
    if ((payload as any).type !== 'user') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = verifySuperAdminToken(header.slice(7));
    req.superAdmin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired super admin token' });
  }
}