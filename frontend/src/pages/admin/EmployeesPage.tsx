import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Pencil, Search, X } from 'lucide-react';
import api from '../../../lib/api';
import { toast } from '../../../stores/toastStore';

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<any>(null);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: async () => (await api.get('/hr/employees')).data.data,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => data.id ? api.patch(`/hr/employees/${data.id}`, data) : api.post('/hr/employees', data),
    onSuccess: () => {
      toast.success(draft?.id ? 'Employee updated' : 'Employee added');
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      setDraft(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Save failed')
  });

  const filtered = employees.filter((e: any) => 
    `${e.first_name} ${e.last_name} ${e.employee_id}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Users className="mr-2" /> Employees</h1>
          <p className="page-subtitle">Manage staff, roles, and base salaries</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input type="text" className="form-input" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '2rem', width: 250 }} />
          </div>
          <button className="btn btn-primary" onClick={() => setDraft({ status: 'Active', join_date: new Date().toISOString().split('T')[0] })}>
            <Plus size={16} /> Add Employee
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Department / Role</th>
              <th>Contact</th>
              <th>Join Date</th>
              <th className="text-right">Base Salary</th>
              <th className="text-center">Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (<tr><td colSpan={8} className="text-center">Loading...</td></tr>) : filtered.length === 0 ? (<tr><td colSpan={8} className="text-center">No employees found.</td></tr>) : filtered.map((e: any) => (
              <tr key={e.id}>
                <td className="font-mono text-muted">{e.employee_id}</td>
                <td style={{ fontWeight: 600 }}>{e.first_name} {e.last_name}</td>
                <td>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{e.department || '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{e.designation || '—'}</div>
                </td>
                <td style={{ fontSize: '0.8rem' }}>
                  {e.phone && <div>{e.phone}</div>}
                  {e.email && <div className="text-muted">{e.email}</div>}
                </td>
                <td>{new Date(e.join_date).toLocaleDateString()}</td>
                <td className="text-right font-mono font-bold">৳{Number(e.base_salary).toLocaleString()}</td>
                <td className="text-center">
                  <span className={`badge badge-${e.status === 'Active' ? 'success' : e.status === 'On Leave' ? 'warning' : 'danger'}`}>
                    {e.status}
                  </span>
                </td>
                <td className="text-center">
                  <button className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...e, join_date: e.join_date.split('T')[0] })}><Pencil size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{draft.id ? 'Edit Employee' : 'Add Employee'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); mutation.mutate(draft); }}>
              <div className="form-grid-2">
                <div className="form-group"><label className="form-label required">Employee ID</label><input className="form-input" required value={draft.employee_id || ''} onChange={e => setDraft({...draft, employee_id: e.target.value})} disabled={!!draft.id} /></div>
                <div className="form-group"><label className="form-label required">Join Date</label><input type="date" className="form-input" required value={draft.join_date || ''} onChange={e => setDraft({...draft, join_date: e.target.value})} /></div>
                
                <div className="form-group"><label className="form-label required">First Name</label><input className="form-input" required value={draft.first_name || ''} onChange={e => setDraft({...draft, first_name: e.target.value})} /></div>
                <div className="form-group"><label className="form-label required">Last Name</label><input className="form-input" required value={draft.last_name || ''} onChange={e => setDraft({...draft, last_name: e.target.value})} /></div>

                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={draft.email || ''} onChange={e => setDraft({...draft, email: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={draft.phone || ''} onChange={e => setDraft({...draft, phone: e.target.value})} /></div>

                <div className="form-group"><label className="form-label">Department</label><input className="form-input" value={draft.department || ''} onChange={e => setDraft({...draft, department: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Designation</label><input className="form-input" value={draft.designation || ''} onChange={e => setDraft({...draft, designation: e.target.value})} /></div>

                <div className="form-group"><label className="form-label required">Base Salary (৳)</label><input type="number" step="0.01" className="form-input" required value={draft.base_salary || ''} onChange={e => setDraft({...draft, base_salary: e.target.value})} /></div>
                <div className="form-group">
                  <label className="form-label required">Status</label>
                  <select className="form-select" value={draft.status || 'Active'} onChange={e => setDraft({...draft, status: e.target.value})}>
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Terminated">Terminated</option>
                  </select>
                </div>
              </div>
              <div className="form-actions mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
