import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  companyId: string;
  type: 'user';
}

export interface SuperAdminTokenPayload {
  sub: string;
  email: string;
  type: 'super_admin';
}

export const signAccessToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);

export const signRefreshToken = (payload: TokenPayload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as SignOptions);

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_SECRET) as TokenPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;

// Super admin tokens (separate secrets so they cannot be forged from a user token)
export const signSuperAdminToken = (payload: SuperAdminTokenPayload) =>
  jwt.sign({ ...payload, _sa: true }, env.JWT_SECRET, { expiresIn: '4h' } as SignOptions);

export const verifySuperAdminToken = (token: string) => {
  const decoded = jwt.verify(token, env.JWT_SECRET) as any;
  if (!decoded || decoded._sa !== true || decoded.type !== 'super_admin') {
    throw new Error('Not a super admin token');
  }
  return decoded as SuperAdminTokenPayload;
};