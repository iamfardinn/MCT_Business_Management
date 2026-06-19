import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api';
import { Pagination } from '../../components/ui/Pagination';

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  actor_id: string;
  actor_name: string;
  actor_email: string;
  old_values: any;
  new_values: any;
  ip_address: string;
  created_at: string;
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [tableFilter, setTableFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit_logs', page, limit, tableFilter, actionFilter],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (tableFilter) p.set('table_name', tableFilter);
      if (actionFilter) p.set('action', actionFilter);
      return (await api.get(`/audit?${p}`)).data;
    },
  });

  const logs: AuditLog[] = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title"><Shield size={24} color="var(--accent-primary)" /> System Audit Logs</h1>
          <p className="page-subtitle">Security trail of all destructive and significant system actions.</p>
        </div>
      </header>

      <div className="card">
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 'var(--space-3)' }}>
          <div className="search-input-wrapper" style={{ width: 250 }}>
            <Filter size={14} className="search-icon" />
            <select className="form-select" style={{ paddingLeft: '2rem' }} value={tableFilter} onChange={e => { setTableFilter(e.target.value); setPage(1); }}>
              <option value="">All Tables</option>
              <option value="cashbook_transactions">Cashbook</option>
              <option value="invoices">Invoices</option>
              <option value="expenses">Expenses</option>
              <option value="users">Users</option>
            </select>
          </div>
          <div className="search-input-wrapper" style={{ width: 200 }}>
            <Filter size={14} className="search-icon" />
            <select className="form-select" style={{ paddingLeft: '2rem' }} value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(1); }}>
              <option value="">All Actions</option>
              <option value="INSERT">Create (INSERT)</option>
              <option value="UPDATE">Update (UPDATE)</option>
              <option value="DELETE">Delete (DELETE)</option>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          {isLoading ? (
            <div className="page-loader"><div className="spinner" /></div>
          ) : logs.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Table / Record ID</th>
                  <th>Actor (User)</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                    </td>
                    <td>
                      <span className={`vtype-badge ${log.action === 'DELETE' ? 'vtype-Payment' : log.action === 'INSERT' ? 'vtype-Receipt' : 'vtype-Journal'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{log.table_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.record_id}</div>
                    </td>
                    <td>
                      <div>{log.actor_name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.actor_email}</div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <Shield size={48} color="var(--text-muted)" style={{ opacity: 0.2, marginBottom: 'var(--space-3)' }} />
              <div className="empty-state-title">No audit logs found</div>
              <p className="empty-state-text">No matching records for your current filters.</p>
            </div>
          )}
        </div>

        <div style={{ padding: '0 var(--space-4)' }}>
          <Pagination 
            page={page} 
            limit={limit} 
            total={total} 
            onPageChange={setPage} 
            onLimitChange={(l) => { setLimit(l); setPage(1); }} 
          />
        </div>
      </div>
    </div>
  );
}
