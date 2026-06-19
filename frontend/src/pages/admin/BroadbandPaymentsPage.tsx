import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wifi, Plus, Pencil, Trash2, X, Search } from 'lucide-react';
import api from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { format } from 'date-fns';
import type { BroadbandPayment } from '@mct/shared';

const DEFAULT_DRAFT: Partial<BroadbandPayment> = {
  month_name: '', group_name: '', monthly_charge: 0, client_name: '', address: '',
  pay_date: new Date().toISOString().split('T')[0], running_bill: 0, payment_amount: 0, total_balance: 0, status: 'Active', comments: ''
};

export default function BroadbandPaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Partial<BroadbandPayment> | null>(null);

  const { data: payments = [], isLoading } = useQuery<BroadbandPayment[]>({
    queryKey: ['broadband_payments', search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      return (await api.get(`/broadband_payments?${p}`)).data.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (payment: Partial<BroadbandPayment>) => {
      if (payment.id) return api.patch(`/broadband_payments/${payment.id}`, payment);
      return api.post('/broadband_payments', payment);
    },
    onSuccess: () => {
      toast.success(draft?.id ? 'Payment updated' : 'Payment logged');
      qc.invalidateQueries({ queryKey: ['broadband_payments'] });
      setDraft(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Save failed')
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/broadband_payments/${id}`),
    onSuccess: () => { toast.success('Deleted successfully'); qc.invalidateQueries({ queryKey: ['broadband_payments'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Delete failed')
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Wifi className="mr-2" /> Broadband Payments</h1>
          <p className="page-subtitle">Manage monthly bills and collections for subscribers</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="form-input"
              placeholder="Search clients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '2rem', width: 250 }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setDraft(DEFAULT_DRAFT)}>
            <Plus size={16} /> Log Payment
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Client / Address</th>
              <th>Month</th>
              <th className="text-right">Charge</th>
              <th className="text-right">Running Bill</th>
              <th className="text-right">Payment</th>
              <th className="text-right">Balance</th>
              <th>Status</th>
              <th>Pay Date</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center">Loading...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted">No payments found.</td></tr>
            ) : (
              payments.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.client_name || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.address}</div>
                  </td>
                  <td>{p.month_name || '—'}</td>
                  <td className="text-right font-mono">৳{Number(p.monthly_charge).toFixed(2)}</td>
                  <td className="text-right font-mono text-danger">৳{Number(p.running_bill).toFixed(2)}</td>
                  <td className="text-right font-mono text-success">৳{Number(p.payment_amount).toFixed(2)}</td>
                  <td className="text-right font-mono">৳{Number(p.total_balance).toFixed(2)}</td>
                  <td><span className={`badge badge-${p.status?.toLowerCase() === 'active' ? 'success' : 'secondary'}`}>{p.status || '—'}</span></td>
                  <td>{p.pay_date ? format(new Date(p.pay_date), 'dd MMM yyyy') : '—'}</td>
                  <td className="text-center">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDraft(p)}><Pencil size={14} /></button>
                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => {
                      if (confirm('Delete this payment record?')) delMutation.mutate(p.id);
                    }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{draft.id ? 'Edit Payment' : 'Log Payment'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); mutation.mutate(draft); }}>
              <div className="form-grid-2">
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label required">Client Name</label>
                  <input className="form-input" required value={draft.client_name || ''} onChange={e => setDraft({ ...draft, client_name: e.target.value })} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Address</label>
                  <input className="form-input" value={draft.address || ''} onChange={e => setDraft({ ...draft, address: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Month Name</label>
                  <input className="form-input" placeholder="e.g. January" value={draft.month_name || ''} onChange={e => setDraft({ ...draft, month_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Pay Date</label>
                  <input type="date" className="form-input" value={draft.pay_date ? draft.pay_date.split('T')[0] : ''} onChange={e => setDraft({ ...draft, pay_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Monthly Charge (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.monthly_charge || 0} onChange={e => setDraft({ ...draft, monthly_charge: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Running Bill (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.running_bill || 0} onChange={e => setDraft({ ...draft, running_bill: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Amount (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.payment_amount || 0} onChange={e => setDraft({ ...draft, payment_amount: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Balance (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.total_balance || 0} onChange={e => setDraft({ ...draft, total_balance: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <input className="form-input" value={draft.status || ''} onChange={e => setDraft({ ...draft, status: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Comments</label>
                  <input className="form-input" value={draft.comments || ''} onChange={e => setDraft({ ...draft, comments: e.target.value })} />
                </div>
              </div>
              <div className="form-actions mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
