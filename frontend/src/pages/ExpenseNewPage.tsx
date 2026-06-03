import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import { format } from 'date-fns';

const EXPENSE_CATEGORIES = [
  { value: 'transport_bill',      label: 'Transport Bill' },
  { value: 'labor_bill',          label: 'Labor Bill' },
  { value: 'carrying_cost',       label: 'Carrying Cost' },
  { value: 'employee_payroll',    label: 'Employee Payroll' },
  { value: 'salary_adjustment',   label: 'Salary Adjustment' },
  { value: 'withdraw_family',     label: 'Family Withdrawal' },
  { value: 'personal_withdrawal', label: 'Personal Withdrawal' },
  { value: 'other',               label: 'Other' },
];

const schema = z.object({
  category: z.string().min(1),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  description: z.string().optional(),
  expense_date: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export default function ExpenseNewPage() {
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { expense_date: format(new Date(), 'yyyy-MM-dd') },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => api.post('/expenses', data),
    onSuccess: () => {
      toast.success('Expense logged and submitted for approval!');
      navigate('/dashboard');
    },
    onError: (err: unknown) => {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Submission failed');
    },
  });

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 'var(--space-2)' }}>
            <ArrowLeft size={15} /> Back
          </button>
          <h1 className="page-title">Log Expense</h1>
          <p className="page-subtitle">Record a business expense for admin approval</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Expense Details</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label required" htmlFor="expense-category">Category</label>
              <select id="expense-category" className={`form-select ${errors.category ? 'error' : ''}`} {...register('category')}>
                <option value="">— Select category —</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {errors.category && <span className="form-error">{errors.category.message}</span>}
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label required" htmlFor="expense-amount">Amount (৳)</label>
                <input
                  id="expense-amount"
                  type="number"
                  step="0.01"
                  className={`form-input ${errors.amount ? 'error' : ''}`}
                  placeholder="0.00"
                  {...register('amount')}
                />
                {errors.amount && <span className="form-error">{errors.amount.message}</span>}
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="expense-date">Date</label>
                <input
                  id="expense-date"
                  type="date"
                  className="form-input"
                  {...register('expense_date')}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="expense-description">Description (Optional)</label>
              <textarea
                id="expense-description"
                className="form-textarea"
                placeholder="Add any notes about this expense..."
                {...register('description')}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
            <button
              type="submit"
              id="submit-expense-btn"
              className="btn btn-primary"
              disabled={mutation.isPending}
            >
              <Send size={15} />
              {mutation.isPending ? 'Submitting...' : 'Submit Expense'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
