/**
 * Attendance configuration.
 *
 * All times are interpreted in UTC. Send scan timestamps as UTC ISO strings.
 */
export const attendanceConfig = {
  /** Standard work hours per day. Hours beyond this = overtime. */
  standardHoursPerDay: 8,

  /** Rounding mode: 'nearest_hour' rounds total minutes to the nearest hour. */
  roundingMode: 'nearest_hour' as const,
};