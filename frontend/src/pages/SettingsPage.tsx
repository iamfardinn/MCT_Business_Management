import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Plus, Pencil, Trash2, X } from 'lucide-react';
import api from '../lib/api';
import { toast } from '../stores/toastStore';

const TABS = [
  { id: 'categories', label: 'Categories', fields: ['name', 'type'] },
  { id: 'user_groups', label: 'User Groups', fields: ['name', 'category_id', 'type'] },
  { id: 'sub_groups', label: 'Sub Groups', fields: ['name', 'group_id', 'type', 'reference'] },
  { id: 'locations', label: 'Locations', fields: ['name', 'group_name'] },
  { id: 'broadband_packages', label: 'Broadband Packages', fields: ['package_to', 'name', 'monthly_fee'] },
  { id: 'reference_lists', label: 'Reference Lists', fields: ['reference_by', 'group_name', 'type'] },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [draft, setDraft] = useState<any>(null);

  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ['settings', activeTab.id],
    queryFn: async () => (await api.get(`/settings/${activeTab.id}`)).data.data,
  });

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.id) return api.patch(`/settings/${activeTab.id}/${payload.id}`, payload);
      return api.post(`/settings/${activeTab.id}`, payload);
    },
    onSuccess: () => {
      toast.success('Saved successfully');
      qc.invalidateQueries({ queryKey: ['settings', activeTab.id] });
      setDraft(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Save failed')
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/${activeTab.id}/${id}`),
    onSuccess: () => {
      toast.success('Deleted successfully');
      qc.invalidateQueries({ queryKey: ['settings', activeTab.id] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Delete failed')
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Settings className="mr-2" /> Settings & Configuration</h1>
          <p className="page-subtitle">Manage legacy configurations, categories, and references</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-4)' }}>
        {/* Sidebar tabs */}
        <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`btn ${activeTab.id === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
              onClick={() => setActiveTab(tab)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, background: 'var(--bg-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{activeTab.label}</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setDraft({})}>
              <Plus size={14} /> Add New
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>ID</th>
                {activeTab.fields.map(f => <th key={f} style={{ textTransform: 'capitalize' }}>{f.replace('_', ' ')}</th>)}
                <th className="text-center" style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={activeTab.fields.length + 2} className="text-center">Loading...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={activeTab.fields.length + 2} className="text-center text-muted">No records found</td></tr>
              ) : (
                data.map(row => (
                  <tr key={row.id}>
                    <td className="text-muted font-mono">{row.id}</td>
                    {activeTab.fields.map(f => <td key={f}>{row[f] || '—'}</td>)}
                    <td className="text-center">
                      <button className="btn btn-ghost btn-sm" onClick={() => setDraft(row)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm text-danger" onClick={() => {
                        if (confirm('Delete this record?')) delMutation.mutate(row.id);
                      }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{draft.id ? 'Edit' : 'New'} {activeTab.label.slice(0, -1)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); mutation.mutate(draft); }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {activeTab.fields.map(f => (
                  <div className="form-group" key={f}>
                    <label className="form-label" style={{ textTransform: 'capitalize' }}>{f.replace('_', ' ')}</label>
                    <input
                      type={f === 'monthly_fee' || f.endsWith('_id') ? 'number' : 'text'}
                      step={f === 'monthly_fee' ? '0.01' : undefined}
                      className="form-input"
                      value={draft[f] || ''}
                      onChange={e => setDraft({ ...draft, [f]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })}
                      required={f === 'name'}
                    />
                  </div>
                ))}
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
