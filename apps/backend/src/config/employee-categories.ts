/**
 * Category defaults — salaries + billing rates.
 *
 * Rates based on the standard wage sheet:
 *   - basic: Basic wage (used for PF calc)
 *   - gross: Total monthly gross (employee salary)
 *   - perDay: Per-day rate for internal calc
 *   - perHour: Per-hour rate for billing clients
 */

export type EmployeeCategoryKey =
  | 'HOUSEKEEPING'
  | 'SEMI_SKILLED'
  | 'SECURITY_GUARD'
  | 'SUPERVISOR';

export interface CategoryDefaults {
  label: string;
  basic: number;
  gross: number;
  perDay: number;
  perHour: number;
}

export const categoryDefaults: Record<EmployeeCategoryKey, CategoryDefaults> = {
  HOUSEKEEPING: {
    label: 'Housekeeping',
    basic: 7410,
    gross: 16366,
    perDay: 629.47,
    perHour: 78.68,
  },
  SEMI_SKILLED: {
    label: 'Semi Skilled',
    basic: 7722,
    gross: 17662,
    perDay: 679.3,
    perHour: 84.91,
  },
  SECURITY_GUARD: {
    label: 'Security Guard',
    basic: 8034,
    gross: 19676,
    perDay: 756.76,
    perHour: 94.59,
  },
  SUPERVISOR: {
    label: 'Supervisor',
    basic: 11500,
    gross: 26219,
    perDay: 1008.41,
    perHour: 126.05,
  },
};

// GST configuration
export const GST_RATE = 18; // total 18%, split into CGST + SGST when intra-state

// Company's state code — used to decide intra-state vs inter-state billing
// Override this by setting COMPANY_STATE_CODE in .env
export function getCompanyStateCode(): string {
  return process.env.COMPANY_STATE_CODE ?? '27'; // default: Maharashtra
}