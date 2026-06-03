import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, TrendingUp, Users, FileText, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../lib/api';
import { toast } from '../../stores/toastStore';

export default function AdminReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [activeTab, setActiveTab] = useState<'sales' | 'dues' | 'cashbook'>('sales');

  const { data: marketSales } = useQuery({
    queryKey: ['reports', 'market-sales', from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      return (await api.get(`/reports/market-sales?${p}`)).data.data;
    },
    enabled: activeTab === 'sales',
  });

  const { data: dueList } = useQuery({
    queryKey: ['reports', 'due-list'],
    queryFn: async () => (await api.get('/reports/due-list')).data.data,
    enabled: activeTab === 'dues',
  });

  const { data: cashbookSummary } = useQuery({
    queryKey: ['reports', 'cashbook-summary', from, to],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      return (await api.get(`/reports/cashbook-summary?${p}`)).data.data;
    },
    enabled: activeTab === 'cashbook',
  });

  async function handleExportExcel() {
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const response = await api.get(`/reports/export/transactions?${p}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MCT-Transactions-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel file downloaded!');
    } catch {
      toast.error('Export failed');
    }
  }

  // Aggregate market sales by category for chart
  const chartData = (() => {
    if (!marketSales) return [];
    const groups: Record<string, number> = {};
    for (const row of marketSales) {
      const key = row.category;
      groups[key] = (groups[key] || 0) + Number(row.total_sales);
    }
    return Object.entries(groups).map(([name, sales]) => ({ name: name.toUpperCase(), sales }));
  })();

  const fmt = (n: number | null | undefined) =>
    `৳${Number(n ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Reports</h1>
          <p className="page-subtitle">Market sales, due lists, cashbook summaries & Excel exports</p>
        </div>
        <button id="export-excel-btn" className="btn btn-primary" onClick={handleExportExcel}>
          <Download size={15} /> Export to Excel
        </button>
      </div>

      {/* Date Filter */}
      <div className="card mb-4" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={15} style={{ color: 'var(--text-muted)' }} />
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <label className="form-label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>From</label>
            <input id="report-from" type="date" className="form-input" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <label className="form-label" style={{ whiteSpace: 'nowrap', marginBottom: 0 }}>To</label>
            <input id="report-to" type="date" className="form-input" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {[
          { key: 'sales', label: 'Market Sales', icon: TrendingUp },
          { key: 'dues',  label: 'All Due List', icon: Users },
          { key: 'cashbook', label: 'Cashbook Summary', icon: BarChart3 },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`report-tab-${key}`}
            className={`btn ${activeTab === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(key as typeof activeTab)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Market Sales ── */}
      {activeTab === 'sales' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {chartData.length > 0 && (
            <div className="card">
              <div className="card-header"><div className="card-title"><BarChart3 size={16} /> Sales by Category</div></div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)' }}
                    formatter={(v) => [`৳${Number(v).toLocaleString()}`, 'Sales']}
                  />
                  <Bar dataKey="sales" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Category</th>
                  <th>Contact</th>
                  <th>Total Sales</th>
                  <th>Damage A</th>
                  <th>Damage B</th>
                  <th>Commission</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {marketSales?.map((r: { invoice_number: string; category: string; contact_name?: string; total_sales: number; total_damage_a?: number; total_damage_b?: number; total_commission?: number; created_at: string }) => (
                  <tr key={r.invoice_number}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--accent-primary)' }}>{r.invoice_number}</td>
                    <td><span className={`badge badge-${r.category}`}>{r.category}</span></td>
                    <td>{r.contact_name || '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(r.total_sales)}</td>
                    <td>{r.total_damage_a ? fmt(r.total_damage_a) : '—'}</td>
                    <td>{r.total_damage_b ? fmt(r.total_damage_b) : '—'}</td>
                    <td>{r.total_commission ? fmt(r.total_commission) : '—'}</td>
                    <td>{format(new Date(r.created_at), 'dd MMM yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!marketSales || marketSales.length === 0) && (
              <div className="empty-state"><div className="empty-state-title">No sales data</div></div>
            )}
          </div>
        </div>
      )}

      {/* ── Due List ── */}
      {activeTab === 'dues' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Area</th><th>Outstanding Due</th></tr></thead>
            <tbody>
              {dueList?.map((r: { name: string; type: string; phone?: string; area?: string; outstanding_balance: number }, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                  <td><span className={`badge badge-${r.type}`}>{r.type.replace('_', ' ')}</span></td>
                  <td>{r.phone || '—'}</td>
                  <td>{r.area || '—'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmt(r.outstanding_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!dueList || dueList.length === 0) && (
            <div className="empty-state"><div className="empty-state-title">No outstanding dues</div></div>
          )}
        </div>
      )}

      {/* ── Cashbook Summary ── */}
      {activeTab === 'cashbook' && cashbookSummary && (
        <div className="grid-2">
          {[
            { label: 'Total Income',  value: fmt(cashbookSummary.total_income),  color: 'var(--success)' },
            { label: 'Total Expense', value: fmt(cashbookSummary.total_expense), color: 'var(--danger)' },
            { label: 'Total Due',     value: fmt(cashbookSummary.total_due),     color: 'var(--warning)' },
            { label: 'Net (Income − Expense − Due)', value: fmt(cashbookSummary.total_income - cashbookSummary.total_expense - cashbookSummary.total_due), color: 'var(--accent-primary)' },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              {cashbookSummary.period_start && (
                <div className="stat-delta">
                  {format(new Date(cashbookSummary.period_start), 'dd MMM')} — {format(new Date(cashbookSummary.period_end), 'dd MMM yyyy')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
