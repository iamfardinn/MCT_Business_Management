import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, TrendingUp, TrendingDown, DollarSign, Clock, Pencil, Trash2, Search, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import type { CashbookTransaction } from '@mct/shared';

// ─── Schema for Daily Summary ───────────────────────────────────────────────
const summarySchema = z.object({
  entry_date: z.string().min(1),
  today_income: z.coerce.number().min(0),
  today_expense: z.coerce.number().min(0),
  today_due: z.coerce.number().min(0),
  previous_cash: z.coerce.number().min(0),
  notes: z.string().optional(),
});
type CashbookSummaryForm = z.infer<typeof summarySchema>;

// ─── Constants ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'summary', label: 'Daily Summary', icon: BookOpen },
  { id: 'income', label: 'Income', icon: TrendingUp },
  { id: 'expense', label: 'Expenses', icon: TrendingDown },
  { id: 'due', label: 'Due Collections', icon: Clock },
];

export default function CashbookPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('summary');
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [txDraft, setTxDraft] = useState<Partial<CashbookTransaction> | null>(null);
  const [txSearch, setTxSearch] = useState('');

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: summaryEntries, isLoading: loadingSummary } = useQuery({
    queryKey: ['cashbook_entries'],
    queryFn: async () => (await api.get('/cashbook')).data.data,
    enabled: activeTab === 'summary',
  });

  const { data: dashboardSummary } = useQuery({
    queryKey: ['cashbook', 'summary'],
    queryFn: async () => (await api.get('/cashbook/summary')).data.data,
  });

  const { data: transactions, isLoading: loadingTx } = useQuery({
    queryKey: ['cashbook_transactions', activeTab, txSearch],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (activeTab !== 'summary') p.set('type', activeTab);
      if (txSearch) p.set('search', txSearch);
      return (await api.get(`/cashbook/transactions?${p}`)).data.data;
    },
    enabled: activeTab !== 'summary',
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const { register, handleSubmit, reset } = useForm<CashbookSummaryForm>({
    resolver: zodResolver(summarySchema),
    defaultValues: { entry_date: format(new Date(), 'yyyy-MM-dd') },
  });

  const createSummaryMutation = useMutation({
    mutationFn: (d: CashbookSummaryForm) => api.post('/cashbook', d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cashbook_entries'] });
      queryClient.invalidateQueries({ queryKey: ['cashbook', 'summary'] });
      toast.success('Summary entry added!');
      setShowSummaryForm(false);
      reset();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
  });

  const txMutation = useMutation({
    mutationFn: (tx: Partial<CashbookTransaction>) => {
      if (tx.id) return api.patch(`/cashbook/transactions/${tx.id}`, tx);
      return api.post('/cashbook/transactions', tx);
    },
    onSuccess: () => {
      toast.success(txDraft?.id ? 'Transaction updated' : 'Transaction logged');
      queryClient.invalidateQueries({ queryKey: ['cashbook_transactions'] });
      setTxDraft(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Save failed')
  });

  const txDelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/cashbook/transactions/${id}`),
    onSuccess: () => {
      toast.success('Deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['cashbook_transactions'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Delete failed')
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const fmt = (n: number | null | undefined) => `৳${Number(n ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cashbook</h1>
          <p className="page-subtitle">Manage daily summaries and detailed transactions</p>
        </div>
        {user?.role === 'admin' && (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {activeTab === 'summary' ? (
              <button className="btn btn-primary" onClick={() => setShowSummaryForm(true)}>
                <Plus size={15} /> New Summary
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setTxDraft({ type: activeTab as any, transaction_date: new Date().toISOString().split('T')[0] })}>
                <Plus size={15} /> Log {activeTab === 'income' ? 'Income' : activeTab === 'expense' ? 'Expense' : 'Due Collection'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="tabs mb-5">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            data-tab={tab.id}
            onClick={() => { setActiveTab(tab.id); setTxSearch(''); }}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Summary Tab Content ── */}
      {activeTab === 'summary' && (
        <>
          <div className="grid-4 mb-6">
            {[
              { label: 'Current Balance', value: fmt(dashboardSummary?.current_balance), icon: DollarSign, color: 'var(--accent-primary)' },
              { label: 'Month Income', value: fmt(dashboardSummary?.total_income), icon: TrendingUp, color: 'var(--success)' },
              { label: 'Month Expense', value: fmt(dashboardSummary?.total_expense), icon: TrendingDown, color: 'var(--danger)' },
              { label: 'Month Due', value: fmt(dashboardSummary?.total_due), icon: Clock, color: 'var(--warning)' },
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

          <div className="table-wrapper">
            {loadingSummary ? (
              <div className="page-loader"><div className="spinner spinner-lg" /></div>
            ) : summaryEntries?.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Previous Cash</th>
                    <th className="text-right">Income</th>
                    <th className="text-right">Expense</th>
                    <th className="text-right">Due</th>
                    <th className="text-right">Closing Balance</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryEntries.map((e: any) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 600 }}>{format(new Date(e.entry_date), 'dd MMM yyyy')}</td>
                      <td className="text-right">{fmt(e.previous_cash)}</td>
                      <td className="text-right" style={{ color: 'var(--success)' }}>{fmt(e.today_income)}</td>
                      <td className="text-right" style={{ color: 'var(--danger)' }}>{fmt(e.today_expense)}</td>
                      <td className="text-right" style={{ color: 'var(--warning)' }}>{fmt(e.today_due)}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{fmt(e.closing_balance)}</td>
                      <td className="truncate" style={{ maxWidth: 200, color: 'var(--text-muted)' }}>{e.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state"><div className="empty-state-title">No cashbook entries</div></div>
            )}
          </div>
        </>
      )}

      {/* ── Transactions Tab Content ── */}
      {activeTab !== 'summary' && (
        <div className="table-wrapper">
          <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div className="search-input-wrapper" style={{ maxWidth: 300 }}>
              <Search size={14} className="search-icon" />
              <input type="text" className="form-input" placeholder="Search transactions..." value={txSearch} onChange={e => setTxSearch(e.target.value)} style={{ paddingLeft: '2rem' }} />
            </div>
          </div>
          {loadingTx ? (
            <div className="page-loader"><div className="spinner spinner-lg" /></div>
          ) : transactions?.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Contact / Party</th>
                  <th>Group</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Actual Amount</th>
                  <th>Note</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: CashbookTransaction) => (
                  <tr key={t.id}>
                    <td>{format(new Date(t.transaction_date), 'dd MMM yyyy')}</td>
                    <td style={{ fontWeight: 500 }}>{t.contact_name || '—'}</td>
                    <td>
                      <div>{t.group_name || '—'}</div>
                      {t.sub_group && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.sub_group}</div>}
                    </td>
                    <td className="text-right font-mono" style={{ color: activeTab === 'expense' ? 'var(--danger)' : 'var(--success)' }}>
                      {fmt(t.amount)}
                    </td>
                    <td className="text-right font-mono">{fmt(t.actual_amount)}</td>
                    <td className="truncate" style={{ maxWidth: 200 }}>{t.note || '—'}</td>
                    <td className="text-center">
                      {user?.role === 'admin' && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setTxDraft(t)}><Pencil size={14} /></button>
                          <button className="btn btn-ghost btn-sm text-danger" onClick={() => { if (confirm('Delete?')) txDelMutation.mutate(t.id); }}><Trash2 size={14} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state"><div className="empty-state-title">No transactions found</div></div>
          )}
        </div>
      )}

      {/* ── Summary Form Modal ── */}
      {showSummaryForm && (
        <div className="modal-overlay" onClick={() => setShowSummaryForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title"><BookOpen size={18} /> New Daily Summary</div>
            <form onSubmit={handleSubmit((d) => createSummaryMutation.mutate(d))} noValidate>
              <div className="form-grid-2">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label required">Entry Date</label>
                  <input type="date" className="form-input" {...register('entry_date')} />
                </div>
                {[
                  { id: 'cb-prev', label: 'Previous Cash', field: 'previous_cash' as const },
                  { id: 'cb-inc', label: 'Today Income', field: 'today_income' as const },
                  { id: 'cb-exp', label: 'Today Expense', field: 'today_expense' as const },
                  { id: 'cb-due', label: 'Today Due', field: 'today_due' as const },
                ].map(({ id, label, field }) => (
                  <div key={field} className="form-group">
                    <label className="form-label required">{label} (৳)</label>
                    <input id={id} type="number" step="0.01" className="form-input" placeholder="0.00" {...register(field)} />
                  </div>
                ))}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" {...register('notes')} />
                </div>
              </div>
              <div className="form-actions mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSummaryForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={createSummaryMutation.isPending}>Save Summary</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Transaction Form Modal ── */}
      {txDraft && (
        <div className="modal-overlay" onClick={() => setTxDraft(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{txDraft.id ? 'Edit' : 'Log'} {txDraft.type}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setTxDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); txMutation.mutate(txDraft); }}>
              <div className="form-grid-2">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label required">Date</label>
                  <input type="date" className="form-input" required value={txDraft.transaction_date?.split('T')[0] || ''} onChange={e => setTxDraft({ ...txDraft, transaction_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Contact / Party</label>
                  <input className="form-input" value={txDraft.contact_name || ''} onChange={e => setTxDraft({ ...txDraft, contact_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Collected By</label>
                  <input className="form-input" value={txDraft.collected_by || ''} onChange={e => setTxDraft({ ...txDraft, collected_by: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Group</label>
                  <input className="form-input" value={txDraft.group_name || ''} onChange={e => setTxDraft({ ...txDraft, group_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sub Group</label>
                  <input className="form-input" value={txDraft.sub_group || ''} onChange={e => setTxDraft({ ...txDraft, sub_group: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Amount (৳)</label>
                  <input type="number" step="0.01" className="form-input" required value={txDraft.amount || 0} onChange={e => setTxDraft({ ...txDraft, amount: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Actual Amount (৳)</label>
                  <input type="number" step="0.01" className="form-input" required value={txDraft.actual_amount || 0} onChange={e => setTxDraft({ ...txDraft, actual_amount: Number(e.target.value) })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Note</label>
                  <textarea className="form-textarea" value={txDraft.note || ''} onChange={e => setTxDraft({ ...txDraft, note: e.target.value })} />
                </div>
              </div>
              <div className="form-actions mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setTxDraft(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={txMutation.isPending}>Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
