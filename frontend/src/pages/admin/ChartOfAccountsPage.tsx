import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Pencil, Trash2, X, Folder, FileText } from 'lucide-react';
import api from '../../lib/api';
import { toast } from '../../stores/toastStore';

export default function ChartOfAccountsPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<any>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: async () => (await api.get('/accounts?tree=true')).data.data,
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.id) return api.put(`/accounts/${payload.id}`, payload);
      return api.post('/accounts', payload);
    },
    onSuccess: () => {
      toast.success('Account saved');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setDraft(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Save failed')
  });

  const renderTree = (nodes: any[], depth = 0) => {
    return nodes.map(node => (
      <div key={node.id} style={{ marginBottom: depth === 0 ? 'var(--space-4)' : 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-3)',
          background: depth === 0 ? 'var(--bg-elevated)' : 'transparent',
          borderBottom: depth > 0 ? '1px solid var(--border-subtle)' : 'none',
          borderRadius: depth === 0 ? 'var(--radius-md)' : 0,
          marginLeft: `${depth * 24}px`
        }}>
          {node.children && node.children.length > 0 ? (
            <Folder size={16} className="mr-2 text-primary" />
          ) : (
            <FileText size={16} className="mr-2 text-muted" />
          )}
          <span className="font-mono font-bold mr-3" style={{ color: 'var(--accent-primary)' }}>{node.code}</span>
          <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{node.name}</span>
          <span className="badge ml-3" style={{ fontSize: '0.65rem' }}>{node.type}</span>
          
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ parent_id: node.id, type: node.type })} title="Add Sub-Account">
              <Plus size={14} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDraft(node)} title="Edit">
              <Pencil size={14} />
            </button>
          </div>
        </div>
        {node.children && node.children.length > 0 && (
          <div style={{ borderLeft: '1px solid var(--border-subtle)', marginLeft: `${depth * 24 + 11}px` }}>
            {renderTree(node.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Network className="mr-2" /> Chart of Accounts</h1>
          <p className="page-subtitle">Manage your general ledger accounts hierarchy</p>
        </div>
        <button className="btn btn-primary" onClick={() => setDraft({ type: 'asset' })}>
          <Plus size={15} /> New Account
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          {isLoading ? (
            <div className="page-loader"><div className="spinner" /></div>
          ) : accounts.length === 0 ? (
            <div className="empty-state">No accounts found</div>
          ) : (
            renderTree(accounts)
          )}
        </div>
      </div>

      {draft && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{draft.id ? 'Edit Account' : 'New Account'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); mutation.mutate(draft); }}>
              <div className="form-group">
                <label className="form-label required">Account Code</label>
                <input className="form-input font-mono" value={draft.code || ''} onChange={e => setDraft({ ...draft, code: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Account Name</label>
                <input className="form-input" value={draft.name || ''} onChange={e => setDraft({ ...draft, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label required">Type</label>
                <select className="form-select" value={draft.type || 'asset'} onChange={e => setDraft({ ...draft, type: e.target.value })} required disabled={!!draft.parent_id}>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
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
