import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Pencil, Trash2, Search, X, ShoppingCart } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { format } from 'date-fns';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import type { PurchaseInvoice, CreatePurchaseRequest } from '@mct/shared';

export default function PurchasesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      return (await api.get(`/purchases?${p}`)).data;
    },
  });

  const { register, control, handleSubmit, reset, watch, setValue } = useForm<CreatePurchaseRequest>({
    defaultValues: {
      invoice_number: `PRG-${Date.now().toString().slice(-6)}`,
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      supplier_name: '',
      supplier_address: '',
      amount: 0,
      discount: 0,
      commission: 0,
      carrying_cost: 0,
      total_amount: 0,
      advance_payment: 0,
      due_amount: 0,
      total_due: 0,
      payment_date: '',
      status: 'Active',
      notes: '',
      items: [{ product_name: '', quantity: 1, unit: 'pcs', rate: 0, discount_percent: 0, discount_amount: 0, line_total: 0 }]
    }
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Auto-calculate totals
  const items = watch('items');
  const amount = items.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);
  const discount = Number(watch('discount') || 0);
  const commission = Number(watch('commission') || 0);
  const carrying_cost = Number(watch('carrying_cost') || 0);
  const advance = Number(watch('advance_payment') || 0);
  
  const total_amount = amount - discount - commission + carrying_cost;
  const due_amount = total_amount - advance;

  const mutation = useMutation({
    mutationFn: (d: CreatePurchaseRequest) => api.post('/purchases', { ...d, amount, total_amount, due_amount }),
    onSuccess: () => {
      toast.success('Purchase invoice saved');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setShowForm(false);
      reset();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Save failed')
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/purchases/${id}`),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
  });

  const fmt = (n: number | null | undefined) => `৳${Number(n ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><ShoppingCart className="mr-2" /> Purchases</h1>
          <p className="page-subtitle">Supplier invoices and inventory purchases</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input type="text" className="form-input" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '2rem' }} />
          </div>
          {user?.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={15} /> New Purchase
            </button>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice #</th>
              <th>Supplier</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Total</th>
              <th className="text-right">Due</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="text-center">Loading...</td></tr> : 
              data?.data?.length === 0 ? <tr><td colSpan={8} className="text-center text-muted">No purchases found.</td></tr> :
              data?.data?.map((p: PurchaseInvoice) => (
                <tr key={p.id}>
                  <td>{format(new Date(p.purchase_date), 'dd MMM yyyy')}</td>
                  <td className="font-mono font-bold">{p.invoice_number}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.supplier_name || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.supplier_address}</div>
                  </td>
                  <td className="text-right font-mono">{fmt(p.amount)}</td>
                  <td className="text-right font-mono text-primary font-bold">{fmt(p.total_amount)}</td>
                  <td className="text-right font-mono text-danger">{fmt(p.due_amount)}</td>
                  <td><span className={`badge badge-${p.status?.toLowerCase() === 'active' ? 'success' : 'secondary'}`}>{p.status}</span></td>
                  <td className="text-center">
                    {user?.role === 'admin' && (
                      <button className="btn btn-ghost btn-sm text-danger" onClick={() => { if (confirm('Delete?')) delMutation.mutate(p.id); }}><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: 'var(--space-10)' }}>
          <div className="modal" style={{ maxWidth: 900, maxHeight: '80vh', overflowY: 'auto' }}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>New Purchase Invoice</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit(d => mutation.mutate(d))}>
              <div className="form-grid-3 mb-4">
                <div className="form-group">
                  <label className="form-label required">Invoice #</label>
                  <input className="form-input" {...register('invoice_number')} required />
                </div>
                <div className="form-group">
                  <label className="form-label required">Date</label>
                  <input type="date" className="form-input" {...register('purchase_date')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input type="date" className="form-input" {...register('payment_date')} />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Supplier Name</label>
                  <input className="form-input" {...register('supplier_name')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" {...register('status')}>
                    <option value="Active">Active</option>
                    <option value="Void">Void</option>
                  </select>
                </div>
              </div>

              {/* Items */}
              <div className="card mb-4" style={{ background: 'var(--bg-surface)' }}>
                <div className="card-header"><div className="card-title">Line Items</div></div>
                <div className="card-body">
                  {fields.map((f, idx) => (
                    <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
                      <div className="form-group mb-0"><label className="form-label">Product</label><input className="form-input" {...register(`items.${idx}.product_name`)} /></div>
                      <div className="form-group mb-0"><label className="form-label">Qty</label><input type="number" step="0.01" className="form-input" {...register(`items.${idx}.quantity`)} onChange={e => { const q = Number(e.target.value); const r = Number(watch(`items.${idx}.rate`)); setValue(`items.${idx}.line_total`, q * r); }} /></div>
                      <div className="form-group mb-0"><label className="form-label">Unit</label><input className="form-input" {...register(`items.${idx}.unit`)} /></div>
                      <div className="form-group mb-0"><label className="form-label">Rate</label><input type="number" step="0.01" className="form-input" {...register(`items.${idx}.rate`)} onChange={e => { const r = Number(e.target.value); const q = Number(watch(`items.${idx}.quantity`)); setValue(`items.${idx}.line_total`, q * r); }} /></div>
                      <div className="form-group mb-0"><label className="form-label">Dis(৳)</label><input type="number" step="0.01" className="form-input" {...register(`items.${idx}.discount_amount`)} /></div>
                      <div className="form-group mb-0"><label className="form-label">Total</label><input type="number" step="0.01" className="form-input" {...register(`items.${idx}.line_total`)} /></div>
                      <button type="button" className="btn btn-ghost text-danger mb-1" onClick={() => remove(idx)}><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => append({ product_name: '', quantity: 1, unit: 'pcs', rate: 0, discount_percent: 0, discount_amount: 0, line_total: 0 })}><Plus size={14} /> Add Item</button>
                </div>
              </div>

              {/* Totals */}
              <div className="form-grid-3">
                <div className="form-group"><label className="form-label">Subtotal</label><div className="form-input" style={{ background: 'var(--bg-elevated)' }}>{fmt(amount)}</div></div>
                <div className="form-group"><label className="form-label">Discount</label><input type="number" step="0.01" className="form-input" {...register('discount')} /></div>
                <div className="form-group"><label className="form-label">Commission</label><input type="number" step="0.01" className="form-input" {...register('commission')} /></div>
                <div className="form-group"><label className="form-label">Carrying</label><input type="number" step="0.01" className="form-input" {...register('carrying_cost')} /></div>
                <div className="form-group"><label className="form-label">Total Amount</label><div className="form-input font-bold text-primary" style={{ background: 'var(--bg-elevated)' }}>{fmt(total_amount)}</div></div>
                <div className="form-group"><label className="form-label">Advance Payment</label><input type="number" step="0.01" className="form-input" {...register('advance_payment')} /></div>
                <div className="form-group"><label className="form-label">Due Amount</label><div className="form-input font-bold text-danger" style={{ background: 'var(--bg-elevated)' }}>{fmt(due_amount)}</div></div>
                <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" {...register('notes')} style={{ gridColumn: 'span 2' }} /></div>
              </div>

              <div className="form-actions mt-5">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>Save Purchase</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
