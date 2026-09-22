import { TokenPayload } from '../utils/jwt';

/**
 * Helper to build a Prisma `where` clause scoped to the user's company.
 * Use this in every query.
 *
 * Example:
 *   prisma.employee.findMany({ where: { ...tenantScope(req.user), isActive: true } })
 */
export function tenantScope(user: TokenPayload) {
  return { companyId: user.companyId };
}