-- 018_hr_payroll.sql
-- MCT Business Management System
-- Migration 018: Human Resources and Payroll

CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(50),
    department VARCHAR(100),
    designation VARCHAR(100),
    join_date DATE NOT NULL,
    base_salary NUMERIC(14, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Active', -- Active, On Leave, Terminated
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE attendance_status AS ENUM ('Present', 'Absent', 'Half Day', 'Leave');

CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    status attendance_status NOT NULL,
    check_in TIME,
    check_out TIME,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, record_date)
);

CREATE TYPE payroll_status AS ENUM ('Draft', 'Approved', 'Paid');

CREATE TABLE IF NOT EXISTS payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    salary_month VARCHAR(20) NOT NULL, -- e.g., '2026-06'
    base_salary NUMERIC(14, 2) DEFAULT 0.00,
    allowances NUMERIC(14, 2) DEFAULT 0.00,
    deductions NUMERIC(14, 2) DEFAULT 0.00,
    net_salary NUMERIC(14, 2) GENERATED ALWAYS AS (base_salary + allowances - deductions) STORED,
    status payroll_status DEFAULT 'Draft',
    payment_date DATE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_id, salary_month)
);
