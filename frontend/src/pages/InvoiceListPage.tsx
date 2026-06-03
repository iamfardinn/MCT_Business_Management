import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../lib/api';

const CATEGORY_LABELS: Record<string, string> = {
  matador: 'Matador', olympic: 'Olympic', bombay: 'Bombay', mtb_broadband: 'Broadband',
};

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', status, category, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      return (await api.get(`/invoices?${params}`)).data;
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">{data?.total ?? 0} total invoices</p>
        </div>
        <button className="btn btn-primary" id="new-invoice-list-btn" onClick={() => navigate('/invoice/new')}>
          <FileText size={15} /> New Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <select
            id="invoice-filter-status"
            className="form-select"
            style={{ width: 160 }}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            id="invoice-filter-category"
            className="form-select"
            style={{ width: 180 }}
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          >
            <option value="">All Categories</option>
            <option value="matador">Matador</option>
            <option value="olympic">Olympic</option>
            <option value="bombay">Bombay</option>
            <option value="mtb_broadband">MTB Broadband</option>
          </select>
        </div>
      </div>

      <div className="table-wrapper">
        {isLoading ? (
          <div className="page-loader" style={{ padding: 'var(--space-8)' }}>
            <div className="spinner spinner-lg" />
            <span>Loading invoices...</span>
          </div>
        ) : data?.data?.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Submitted By</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((inv: {
                id: string; invoice_number: string; category: string;
                contact_name?: string; subscriber_name?: string;
                submitted_by_name: string; status: string; created_at: string;
              }) => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                    {inv.invoice_number}
                  </td>
                  <td><span className={`badge badge-${inv.category}`}>{CATEGORY_LABELS[inv.category]}</span></td>
                  <td style={{ color: 'var(--text-primary)' }}>{inv.contact_name || inv.subscriber_name || '—'}</td>
                  <td>{inv.submitted_by_name}</td>
                  <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                  <td>{format(new Date(inv.created_at), 'dd MMM yyyy')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={24} /></div>
            <div className="empty-state-title">No invoices found</div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Page {page} of {Math.ceil(data.total / 20)}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(data.total / 20)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
