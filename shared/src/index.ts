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

// ─── Settings / Configuration ──────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
  type?: string;
}

export interface UserGroup {
  id: number;
  name: string;
  category_id?: number;
  type?: string;
}

export interface SubGroup {
  id: number;
  name: string;
  group_id?: number;
  type?: string;
  reference?: string;
}

export interface Location {
  id: number;
  name: string;
  group_name?: string;
}

export interface BroadbandPackage {
  id: number;
  package_to?: string;
  name: string;
  monthly_fee: number;
}

export interface ReferenceList {
  id: number;
  reference_by?: string;
  group_name?: string;
  type?: string;
}

// ─── Products ────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  group_name?: string;
  name: string;
  unit?: string;
  sales_rate: number;
  s_unit: number;
  p_unit: number;
  purchase_rate: number;
  offer: number;
  offer_rate: number;
  offer_sales: number;
  category?: string;
}

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
  market_cost?: number;
  carrying_cost?: number;
  commission?: number;
  free_value?: number;
  damage_value?: number;
  market_short?: number;
  deposit_cash?: number;
  due_collections?: number;
  collections_date?: string;
  total_sales?: number;
  invoice_total?: number;
  created_at: string;
  updated_at: string;
  items: InvoiceItem[];
}

export interface CreateInvoiceRequest {
  category: InvoiceCategory;
  contact_id?: string;
  subscriber_id?: string;
  notes?: string;
  market_cost?: number;
  carrying_cost?: number;
  commission?: number;
  free_value?: number;
  damage_value?: number;
  market_short?: number;
  deposit_cash?: number;
  due_collections?: number;
  collections_date?: string;
  total_sales?: number;
  invoice_total?: number;
  items: Omit<InvoiceItem, 'id' | 'invoice_id'>[];
}

// ─── Broadband Payments ────────────────────────────────────────────────────────

export interface BroadbandPayment {
  id: string;
  month_name?: string;
  group_name?: string;
  monthly_charge: number;
  client_name?: string;
  address?: string;
  pay_date?: string;
  running_bill: number;
  payment_amount: number;
  total_balance: number;
  status?: string;
  comments?: string;
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

// ─── Purchase System ────────────────────────────────────────────────────────────

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_name?: string;
  quantity: number;
  unit?: string;
  rate: number;
  discount_percent: number;
  discount_amount: number;
  line_total: number;
}

export interface PurchaseInvoice {
  id: string;
  invoice_number: string;
  purchase_date: string;
  supplier_name?: string;
  supplier_address?: string;
  amount: number;
  discount: number;
  commission: number;
  carrying_cost: number;
  total_amount: number;
  advance_payment: number;
  due_amount: number;
  total_due: number;
  payment_date?: string;
  status: string;
  notes?: string;
  submitted_by?: string;
  created_at: string;
  updated_at: string;
  items: PurchaseItem[];
}

export interface CreatePurchaseRequest {
  invoice_number: string;
  purchase_date: string;
  supplier_name?: string;
  supplier_address?: string;
  amount: number;
  discount: number;
  commission: number;
  carrying_cost: number;
  total_amount: number;
  advance_payment: number;
  due_amount: number;
  total_due: number;
  payment_date?: string;
  status?: string;
  notes?: string;
  items: Omit<PurchaseItem, 'id' | 'purchase_id'>[];
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

export interface CashbookTransaction {
  id: string;
  transaction_date: string;
  type: 'income' | 'due' | 'expense';
  group_name?: string;
  sub_group?: string;
  contact_name?: string;
  debit?: string;
  credit?: string;
  amount: number;
  actual_amount: number;
  note?: string;
  collected_by?: string;
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

// ─── Daybook (Tally-style) ────────────────────────────────────────────────────

export type VoucherType = 'Receipt' | 'Payment' | 'Contra' | 'Journal' | 'Sales' | 'Purchase';

export type DaybookSource = 'cashbook' | 'invoice' | 'expense';

export interface DaybookEntry {
  id: string;
  entry_date: string;
  voucher_type: VoucherType;
  voucher_no: string;
  particulars: string;
  group_name?: string | null;
  narration?: string | null;
  debit_amount: number;
  credit_amount: number;
  debit_ledger?: string | null;
  credit_ledger?: string | null;
  voucher_group?: string | null;
  source: DaybookSource;
}

export interface CreateVoucherRequest {
  entry_date: string;
  voucher_type: VoucherType;
  debit_ledger: string;
  credit_ledger: string;
  amount: number;
  narration?: string;
}

export interface UpdateInvoiceVoucherRequest {
  entry_date?: string;
  narration?: string;
  amount?: number; // adjusts a single-line invoice total
}

export interface DaybookResponse {
  success: boolean;
  data: DaybookEntry[];
  totals: {
    total_debit: number;
    total_credit: number;
    opening_balance: number;
    closing_balance: number;
  };
  total: number;
  page: number;
  limit: number;
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
