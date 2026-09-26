// Shared domain types for the frontend

export type Role = 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';

export type EmployeeCategory =
  | 'HOUSEKEEPING'
  | 'SEMI_SKILLED'
  | 'SECURITY_GUARD'
  | 'SUPERVISOR';

export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  fatherName?: string | null;
  category: EmployeeCategory;
  department?: string | null;
  designation?: string | null;
  employmentType: EmploymentType;
  dateOfJoining: string;
  dateOfLeaving?: string | null;
  isActive: boolean;
  baseSalary?: string | number | null;
  currency: string;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateEmployeeInput {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: string;
  fatherName?: string;
  category?: EmployeeCategory;
  department?: string;
  designation?: string;
  employmentType?: EmploymentType;
  dateOfJoining: string;
  baseSalary?: number;
  currency?: string;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput> & {
  isActive?: boolean;
  dateOfLeaving?: string | null;
};

// ============ ATTENDANCE ============

export type LogDirection = 'IN' | 'OUT';
export type LogSource = 'FACE' | 'FINGERPRINT' | 'CARD' | 'PIN' | 'MANUAL' | 'MOBILE';

export interface AttendanceLog {
  id: string;
  employeeId: string;
  timestamp: string;
  direction: LogDirection;
  source: LogSource;
  deviceId?: string | null;
  confidence?: number | null;
  scanId?: string | null;
  notes?: string | null;
  createdAt: string;
  employee?: {
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
}

export interface AttendanceDay {
  id: string;
  employeeId: string;
  date: string;
  firstIn?: string | null;
  lastOut?: string | null;
  totalMinutes: number;
  overtimeMins: number;
  lateMins: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySheetEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string | null;
  category: string;
  employmentType: string;
  attendance: {
    id: string;
    status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE' | string;
    totalMinutes: number;
    hours: number;
    firstIn?: string | null;
    lastOut?: string | null;
    updatedAt: string;
  } | null;
}

export interface DailySheetResponse {
  date: string;
  stats: {
    totalEmployees: number;
    markedCount: number;
    unmarkedCount: number;
    presentCount: number; // Full day (8h)
    halfDayCount: number; // Half day (4h)
    absentCount: number;  // Absent (0h)
    leaveCount: number;
    totalHours: number;
  };
  employees: DailySheetEmployee[];
}

// ============ FACE ============

export interface FaceEmbeddingRow {
  id: string;
  employeeId: string;
  quality: number | null;
  createdAt: string;
  employee: {
    employeeCode: string;
    firstName: string;
    lastName: string;
  };
}

export interface EnrollFaceResponse {
  employeeId: string;
  dimensions: number;
  embeddingId: string;
}

// ============ PAYROLL ============

export interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'COMPLETED' | 'FAILED';
  totalGross: string | number;
  totalNet: string | number;
  totalEmployees: number;
  createdAt: string;
  updatedAt: string;
  _count?: { payslips: number };
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  email: string;
  periodStart: string;
  periodEnd: string;
  presentDays: string | number;
  absentDays: string | number;
  halfDays: string | number;
  overtimeMins: number;
  lateMins: number;
  grossPay: string | number;
  totalDeductions: string | number;
  netPay: string | number;
  currency: string;
  emailedAt?: string | null;
  createdAt: string;
}

export interface PayslipLineItem {
  id: string;
  payslipId: string;
  category: 'EARNING' | 'DEDUCTION';
  label: string;
  amount: string | number;
  sortOrder: number;
}

// ============ DEVICES ============

export type DeviceType = 'CAMERA' | 'FINGERPRINT' | 'MOBILE' | 'WEB';

export interface DeviceApiKey {
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  isActive: boolean;
}

export interface Device {
  id: string;
  name: string;
  location?: string | null;
  type: DeviceType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  apiKeys: DeviceApiKey[];
}

export interface CreateDeviceResponse {
  device: Device;
  apiKey: string;
}
// ============ TALENT BILLING ============

export interface Client {
  id: string;
  name: string;
  gstin?: string | null;
  address: string;
  email?: string | null;
  phone?: string | null;
  stateCode?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { assignments: number; invoices: number };
  rateOverrides?: ClientCategoryRate[];
}

export interface ClientCategoryRate {
  id: string;
  clientId: string;
  category: EmployeeCategory;
  hourlyRate: string | number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClientInput {
  name: string;
  gstin?: string;
  address: string;
  email?: string;
  phone?: string;
  stateCode?: string;
}

export interface EmployeeAssignment {
  id: string;
  clientId: string;
  employeeId: string;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; name: string; gstin?: string | null };
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    category: EmployeeCategory;
    isActive: boolean;
  } | null;
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'PARTIAL' | 'CANCELLED';

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  companyId: string;
  amount: string | number;
  paymentDate: string;
  paymentMode: string; // 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'
  reference?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface RecordInvoicePaymentInput {
  amount: number;
  paymentDate?: string;
  paymentMode?: string;
  reference?: string;
  notes?: string;
}

export interface TaxInvoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string | number;
  cgstAmount: string | number;
  sgstAmount: string | number;
  igstAmount: string | number;
  totalAmount: string | number;
  paidAmount?: string | number;
  pendingAmount?: string | number;
  status: InvoiceStatus;
  issuedAt: string;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: {
    id: string;
    name: string;
    gstin?: string | null;
    address?: string;
    email?: string | null;
    phone?: string | null;
  };
  lineItems?: TaxInvoiceLineItem[];
  payments?: InvoicePayment[];
  _count?: { lineItems: number; payments?: number };
}

export interface TaxInvoiceLineItem {
  id: string;
  invoiceId: string;
  employeeId?: string | null;
  employeeCode: string;
  employeeName: string;
  category: EmployeeCategory;
  hoursWorked: string | number;
  hourlyRate: string | number;
  amount: string | number;
}

export interface GenerateInvoiceInput {
  clientId: string;
  periodStart: string;
  periodEnd: string;
  gstMode?: 'auto' | 'cgst_sgst' | 'igst';
  notes?: string;
  dueDate?: string;
  invoiceNumber?: string;
}

// ============ COMPANY ============

export interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  stateCode?: string | null;
  logoPath?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankIfsc?: string | null;
  invoicePrefix?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCompanyInput {
  name?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  website?: string;
  stateCode?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  invoicePrefix?: string;
}
