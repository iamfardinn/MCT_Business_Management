import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, TrendingUp, TrendingDown, DollarSign, Clock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';

const schema = z.object({
  entry_date: z.string().min(1),
  today_income: z.coerce.number().min(0),
  today_expense: z.coerce.number().min(0),
  today_due: z.coerce.number().min(0),
  previous_cash: z.coerce.number().min(0),
  notes: z.string().optional(),
});
type CashbookForm = z.infer<typeof schema>;

export default function CashbookPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: entries, isLoading } = useQuery({
    queryKey: ['cashbook'],
    queryFn: async () => (await api.get('/cashbook')).data.data,
  });

  const { data: summary } = useQuery({
    queryKey: ['cashbook', 'summary'],
    queryFn: async () => (await api.get('/cashbook/summary')).data.data,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CashbookForm>({
    resolver: zodResolver(schema),
    defaultValues: { entry_date: format(new Date(), 'yyyy-MM-dd') },
  });

  const createMutation = useMutation({
    mutationFn: (d: CashbookForm) => api.post('/cashbook', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbook'] });
      toast.success('Cashbook entry added!');
      setShowForm(false);
      reset();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed';
      toast.error(msg);
    },
  });

  const fmt = (n: number | null | undefined) =>
    `৳${Number(n ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cashbook</h1>
          <p className="page-subtitle">Daily income, expense and balance tracker</p>
        </div>
        {user?.role === 'admin' && (
          <button id="add-cashbook-btn" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={15} /> New Entry
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid-4 mb-6">
        {[
          { label: 'Current Balance', value: fmt(summary?.current_balance), icon: DollarSign, color: 'var(--accent-primary)' },
          { label: 'Month Income', value: fmt(summary?.total_income), icon: TrendingUp, color: 'var(--success)' },
          { label: 'Month Expense', value: fmt(summary?.total_expense), icon: TrendingDown, color: 'var(--danger)' },
          { label: 'Month Due', value: fmt(summary?.total_due), icon: Clock, color: 'var(--warning)' },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div style={{ position: 'absolute', right: 'var(--space-5)', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 'var(--radius-md)', background: `${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              <s.icon size={20} />
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Entries Table */}
      <div className="table-wrapper">
        {isLoading ? (
          <div className="page-loader" style={{ padding: 'var(--space-8)' }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : entries?.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Previous Cash</th>
                <th>Income</th>
                <th>Expense</th>
                <th>Due</th>
                <th>Closing Balance</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: { id: string; entry_date: string; previous_cash: number; today_income: number; today_expense: number; today_due: number; closing_balance: number; notes?: string }) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {format(new Date(e.entry_date), 'dd MMM yyyy')}
                  </td>
                  <td>{fmt(e.previous_cash)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmt(e.today_income)}</td>
                  <td style={{ color: 'var(--danger)' }}>{fmt(e.today_expense)}</td>
                  <td style={{ color: 'var(--warning)' }}>{fmt(e.today_due)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(e.closing_balance)}</td>
                  <td style={{ color: 'var(--text-muted)', maxWidth: 200 }} className="truncate">{e.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><BookOpen size={24} /></div>
            <div className="empty-state-title">No cashbook entries yet</div>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showForm && user?.role === 'admin' && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><BookOpen size={18} /> New Cashbook Entry</div>
            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} noValidate>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required" htmlFor="cb-date">Entry Date</label>
                  <input id="cb-date" type="date" className="form-input" {...register('entry_date')} />
                </div>
                <div className="form-grid-2">
                  {[
                    { id: 'cb-prev-cash', label: 'Previous Cash', field: 'previous_cash' as const },
                    { id: 'cb-income', label: 'Today Income', field: 'today_income' as const },
                    { id: 'cb-expense', label: 'Today Expense', field: 'today_expense' as const },
                    { id: 'cb-due', label: 'Today Due', field: 'today_due' as const },
                  ].map(({ id, label, field }) => (
                    <div key={field} className="form-group">
                      <label className="form-label required" htmlFor={id}>{label} (৳)</label>
                      <input id={id} type="number" step="0.01" className="form-input" placeholder="0.00" {...register(field)} />
                    </div>
                  ))}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="cb-notes">Notes</label>
                  <textarea id="cb-notes" className="form-textarea" placeholder="Optional notes..." {...register('notes')} />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" id="save-cashbook-btn" className="btn btn-primary" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
