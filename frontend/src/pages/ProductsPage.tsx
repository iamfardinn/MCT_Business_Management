import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Search, Plus, Pencil, Trash2, X } from 'lucide-react';
import api from '../lib/api';
import { toast } from '../stores/toastStore';
import type { Product } from '@mct/shared';

const DEFAULT_DRAFT: Partial<Product> = {
  group_name: '', name: '', unit: '', category: '',
  sales_rate: 0, s_unit: 0, p_unit: 0, purchase_rate: 0,
  offer: 0, offer_rate: 0, offer_sales: 0
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Partial<Product> | null>(null);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', search],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      return (await api.get(`/products?${p}`)).data.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (prod: Partial<Product>) => {
      if (prod.id) return api.patch(`/products/${prod.id}`, prod);
      return api.post('/products', prod);
    },
    onSuccess: () => {
      toast.success(draft?.id ? 'Product updated' : 'Product created');
      qc.invalidateQueries({ queryKey: ['products'] });
      setDraft(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Save failed')
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => { toast.success('Product deleted'); qc.invalidateQueries({ queryKey: ['products'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Delete failed')
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Package className="mr-2" /> Products</h1>
          <p className="page-subtitle">Manage product catalog and pricing</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="form-input"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '2rem', width: 250 }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setDraft(DEFAULT_DRAFT)}>
            <Plus size={16} /> New Product
          </button>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Product Name</th>
              <th>Unit</th>
              <th className="text-right">Current Stock</th>
              <th className="text-right">Sales Rate</th>
              <th className="text-right">Purchase Rate</th>
              <th className="text-right">Offer</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center">Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted">No products found.</td></tr>
            ) : (
              products.map(p => (
                <tr key={p.id}>
                  <td>{p.group_name || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td>{p.unit || '—'}</td>
                  <td className="text-right font-mono" style={{ fontWeight: 700, color: (p as any).current_stock < 10 ? 'var(--danger)' : 'var(--success)' }}>
                    {Number((p as any).current_stock || 0).toFixed(0)}
                  </td>
                  <td className="text-right font-mono">৳{Number(p.sales_rate).toFixed(2)}</td>
                  <td className="text-right font-mono">৳{Number(p.purchase_rate).toFixed(2)}</td>
                  <td className="text-right font-mono">{p.offer > 0 ? `৳${Number(p.offer).toFixed(2)}` : '—'}</td>
                  <td className="text-center">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDraft(p)}><Pencil size={14} /></button>
                    <button className="btn btn-ghost btn-sm text-danger" onClick={() => {
                      if (confirm('Delete this product?')) delMutation.mutate(p.id);
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{draft.id ? 'Edit Product' : 'New Product'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); mutation.mutate(draft); }}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label required">Name</label>
                  <input className="form-input" required value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Group Name</label>
                  <input className="form-input" value={draft.group_name || ''} onChange={e => setDraft({ ...draft, group_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <input className="form-input" value={draft.unit || ''} onChange={e => setDraft({ ...draft, unit: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input className="form-input" value={draft.category || ''} onChange={e => setDraft({ ...draft, category: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sales Rate (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.sales_rate || 0} onChange={e => setDraft({ ...draft, sales_rate: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Purchase Rate (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.purchase_rate || 0} onChange={e => setDraft({ ...draft, purchase_rate: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Offer (৳)</label>
                  <input type="number" step="0.01" className="form-input" value={draft.offer || 0} onChange={e => setDraft({ ...draft, offer: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Offer Sales</label>
                  <input type="number" step="0.01" className="form-input" value={draft.offer_sales || 0} onChange={e => setDraft({ ...draft, offer_sales: Number(e.target.value) })} />
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
