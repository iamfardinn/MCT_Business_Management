import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Plus, Search, CheckCircle, X } from 'lucide-react';
import api from '../../../lib/api';
import { toast } from '../../../stores/toastStore';

export default function PayrollPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<any>(null);

  const { data: payrolls = [], isLoading } = useQuery({
    queryKey: ['hr-payroll'],
    queryFn: async () => (await api.get('/hr/payroll')).data.data,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['hr-employees'],
    queryFn: async () => (await api.get('/hr/employees')).data.data,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/payroll', data),
    onSuccess: () => {
      toast.success('Payroll created');
      qc.invalidateQueries({ queryKey: ['hr-payroll'] });
      setDraft(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create payroll')
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/hr/payroll/${id}/approve`),
    onSuccess: () => { toast.success('Payroll approved'); qc.invalidateQueries({ queryKey: ['hr-payroll'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to approve payroll')
  });

  const filtered = payrolls.filter((p: any) => 
    `${p.first_name} ${p.last_name} ${p.emp_code} ${p.salary_month}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Banknote className="mr-2" /> Payroll & Salary</h1>
          <p className="page-subtitle">Manage monthly payroll generation and approvals</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper">
            <Search size={14} className="search-icon" />
            <input type="text" className="form-input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '2rem', width: 250 }} />
          </div>
          <button className="btn btn-primary" onClick={() => setDraft({ salary_month: new Date().toISOString().substring(0, 7) })}>
            <Plus size={16} /> Generate Payroll
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Employee Name</th>
              <th className="text-right">Base Salary</th>
              <th className="text-right">Allowances</th>
              <th className="text-right">Deductions</th>
              <th className="text-right">Net Payable</th>
              <th className="text-center">Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (<tr><td colSpan={8} className="text-center">Loading...</td></tr>) : filtered.length === 0 ? (<tr><td colSpan={8} className="text-center">No payroll records found.</td></tr>) : filtered.map((p: any) => (
              <tr key={p.id}>
                <td className="font-mono" style={{ fontWeight: 600 }}>{p.salary_month}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{p.first_name} {p.last_name}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>{p.emp_code}</div>
                </td>
                <td className="text-right font-mono">৳{Number(p.base_salary).toLocaleString()}</td>
                <td className="text-right font-mono text-success">+৳{Number(p.allowances).toLocaleString()}</td>
                <td className="text-right font-mono text-danger">-৳{Number(p.deductions).toLocaleString()}</td>
                <td className="text-right font-mono font-bold" style={{ fontSize: '1.1rem' }}>৳{Number(p.net_salary).toLocaleString()}</td>
                <td className="text-center">
                  <span className={`badge badge-${p.status === 'Draft' ? 'warning' : p.status === 'Approved' ? 'primary' : 'success'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="text-center">
                  {p.status === 'Draft' && (
                    <button className="btn btn-ghost btn-sm text-success" onClick={() => { if(confirm('Approve this payroll?')) approveMutation.mutate(p.id); }} title="Approve">
                      <CheckCircle size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="modal-overlay" onClick={() => setDraft(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Generate Employee Payroll</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}><X size={16} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); mutation.mutate(draft); }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label required">Employee</label>
                  <select 
                    className="form-select" 
                    required 
                    value={draft.employee_id || ''} 
                    onChange={e => {
                      const emp = employees.find((x: any) => x.id === e.target.value);
                      setDraft({...draft, employee_id: emp?.id, base_salary: emp?.base_salary || 0});
                    }}
                  >
                    <option value="">Select an employee...</option>
                    {employees.filter((e: any) => e.status === 'Active').map((e: any) => (
                      <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group"><label className="form-label required">Salary Month (YYYY-MM)</label><input type="month" className="form-input" required value={draft.salary_month || ''} onChange={e => setDraft({...draft, salary_month: e.target.value})} /></div>
                <div className="form-group"><label className="form-label required">Base Salary (৳)</label><input type="number" step="0.01" className="form-input" required value={draft.base_salary || 0} onChange={e => setDraft({...draft, base_salary: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Allowances/Bonuses (৳)</label><input type="number" step="0.01" className="form-input" value={draft.allowances || 0} onChange={e => setDraft({...draft, allowances: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Deductions/Absences (৳)</label><input type="number" step="0.01" className="form-input" value={draft.deductions || 0} onChange={e => setDraft({...draft, deductions: e.target.value})} /></div>
              </div>
              <div className="form-actions mt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>Generate Draft</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
