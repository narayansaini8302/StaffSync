import { prisma } from '../../config/prisma';
import { hashPassword, verifyPassword } from '../../utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';

export async function registerUser(input: {
  email: string;
  password: string;
  role?: 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';
  companyId: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error('EMAIL_IN_USE');

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role ?? 'EMPLOYEE',
      companyId: input.companyId,
    },
  });

  return user;
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) throw new Error('INVALID_CREDENTIALS');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error('INVALID_CREDENTIALS');

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    type: 'user' as const,
  };

  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
    },
  };
}

export async function refreshTokens(refreshToken: string) {
  const payload = verifyRefreshToken(refreshToken);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw new Error('INVALID_REFRESH');

  const newPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
    type: 'user' as const,
  };

  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  };
}