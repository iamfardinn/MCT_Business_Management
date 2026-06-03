// ─── Core Enumerations ──────────────────────────────────────────────────────

export type UserRole = 'admin' | 'employee';

export type RecordStatus = 'pending' | 'approved' | 'rejected';

export type InvoiceCategory =
  | 'matador'
  | 'olympic'
  | 'bombay'
  | 'mtb_broadband';

export type ContactType = 'sub_dealer' | 'retailer' | 'side_market' | 'employee';

export type SubscriberStatus = 'active' | 'inactive';

export type ExpenseCategory =
  | 'transport_bill'
  | 'labor_bill'
  | 'carrying_cost'
  | 'employee_payroll'
  | 'salary_adjustment'
  | 'withdraw_family'
  | 'personal_withdrawal'
  | 'other';

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT';

// ─── User & Auth ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthTokenPayload {
  sub: string; // user id
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: Omit<User, 'created_at' | 'updated_at'>;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_name?: string;
  line_total: number;
  damage_a?: number;
  damage_b?: number;
  free_items?: number;
  commission?: number;
  // Broadband-specific
  month_name?: string;
  subscriber_address?: string;
  running_bill?: number;
  subscriber_id?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  category: InvoiceCategory;
  contact_id?: string;
  subscriber_id?: string;
  status: RecordStatus;
  notes?: string;
  submitted_by: string;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  items: InvoiceItem[];
}

export interface CreateInvoiceRequest {
  category: InvoiceCategory;
  contact_id?: string;
  subscriber_id?: string;
  notes?: string;
  items: Omit<InvoiceItem, 'id' | 'invoice_id'>[];
}

// ─── Expense ─────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  expense_date: string;
  status: RecordStatus;
  submitted_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateExpenseRequest {
  category: ExpenseCategory;
  amount: number;
  description?: string;
  expense_date: string;
}

// ─── Cashbook ─────────────────────────────────────────────────────────────────

export interface CashbookEntry {
  id: string;
  entry_date: string;
  today_income: number;
  today_expense: number;
  today_due: number;
  previous_cash: number;
  closing_balance: number; // computed: previous_cash + today_income - today_expense - today_due
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCashbookEntryRequest {
  entry_date: string;
  today_income: number;
  today_expense: number;
  today_due: number;
  previous_cash: number;
  notes?: string;
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  phone?: string;
  address?: string;
  area?: string;
  outstanding_balance: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContactRequest {
  type: ContactType;
  name: string;
  phone?: string;
  address?: string;
  area?: string;
}

// ─── Broadband Subscriber ─────────────────────────────────────────────────────

export interface Subscriber {
  id: string;
  name: string;
  phone?: string;
  address: string;
  area_group?: string;
  status: SubscriberStatus;
  monthly_bill: number;
  running_balance: number;
  connection_date?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSubscriberRequest {
  name: string;
  phone?: string;
  address: string;
  area_group?: string;
  monthly_bill: number;
  connection_date?: string;
}

// ─── Approval ─────────────────────────────────────────────────────────────────

export interface ApprovalRecord {
  id: string;
  record_type: 'invoice' | 'expense';
  record_id: string;
  action: 'approve' | 'reject';
  actor_id: string;
  reason?: string;
  acted_at: string;
}

// ─── Socket Events ────────────────────────────────────────────────────────────

export interface SocketEvents {
  'submission:new': { type: 'invoice' | 'expense'; record: Invoice | Expense };
  'submission:approved': { type: 'invoice' | 'expense'; record_id: string };
  'submission:rejected': { type: 'invoice' | 'expense'; record_id: string; reason: string };
  'cashbook:updated': { entry: CashbookEntry };
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}
