export const payrollConfig = {
  daysInMonth: 30,
  halfDayFactor: 0.5,
  standardHoursPerDay: 8,

  earningsSplit: {
    basic: 0.5,
    hra: 0.2,
    specialAllowance: 0.3,
  },

  pfRate: 0.12,

  professionalTax: {
    threshold: 15000,
    amount: 200,
  },

  taxSlabs: [
    { upTo: 500000, rate: 0 },
    { upTo: 1000000, rate: 0.1 },
    { upTo: 2000000, rate: 0.2 },
    { upTo: Infinity, rate: 0.3 },
  ],

  currency: 'INR',
};
