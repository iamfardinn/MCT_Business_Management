import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Clock, CheckCircle, DollarSign, Users, FileText, Wifi } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

function StatCard({ label, value, icon: Icon, color, delta }: {
  label: string; value: string; icon: React.ElementType; color: string; delta?: string;
}) {
  return (
    <div className="stat-card">
      <div style={{ position: 'absolute', right: 'var(--space-5)', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}20`, color }}>
        <Icon size={20} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {delta && <div className="stat-delta">{delta}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: cashbook } = useQuery({
    queryKey: ['cashbook', 'summary'],
    queryFn: async () => (await api.get('/cashbook/summary')).data.data,
  });

  const { data: myInvoices } = useQuery({
    queryKey: ['invoices', 'my', 'recent'],
    queryFn: async () => (await api.get('/invoices?limit=5')).data,
  });

  const { data: pendingCount } = useQuery({
    queryKey: ['invoices', 'pending-count'],
    queryFn: async () => (await api.get('/invoices?status=pending&limit=1')).data.total,
  });

  const fmt = (n: number | string | null | undefined) =>
    n != null ? `৳${Number(n).toLocaleString('en-BD', { minimumFractionDigits: 2 })}` : '৳0.00';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Good {getGreeting()}, {user?.full_name?.split(' ')[0]}!</h1>
          <p className="page-subtitle">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
        </div>
        <button
          id="new-invoice-btn"
          className="btn btn-primary"
          onClick={() => navigate('/invoice/new')}
        >
          <FileText size={15} />
          New Invoice
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid-4 mb-6">
        <StatCard
          label="Today's Balance"
          value={fmt(cashbook?.current_balance)}
          icon={DollarSign}
          color="var(--accent-primary)"
          delta="Closing balance"
        />
        <StatCard
          label="This Month Income"
          value={fmt(cashbook?.total_income)}
          icon={TrendingUp}
          color="var(--success)"
        />
        <StatCard
          label="This Month Expense"
          value={fmt(cashbook?.total_expense)}
          icon={TrendingDown}
          color="var(--danger)"
        />
        <StatCard
          label="Pending Approvals"
          value={String(pendingCount ?? 0)}
          icon={Clock}
          color="var(--warning)"
          delta="Awaiting review"
        />
      </div>

      {/* Recent Invoices */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><FileText size={16} /> Recent Invoices</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/invoices')}>View All</button>
        </div>
        {myInvoices?.data?.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {myInvoices.data.map((inv: { id: string; invoice_number: string; category: string; status: string; created_at: string }) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.invoice_number}</td>
                    <td><CategoryBadge category={inv.category} /></td>
                    <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                    <td>{format(new Date(inv.created_at), 'dd MMM yyyy')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><FileText size={24} /></div>
            <div className="empty-state-title">No invoices yet</div>
            <p style={{ fontSize: '0.875rem' }}>Create your first invoice to get started</p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/invoice/new')}>Create Invoice</button>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid-3" style={{ marginTop: 'var(--space-4)' }}>
        <QuickAction icon={FileText} label="New Invoice" desc="Submit for approval" to="/invoice/new" color="var(--accent-primary)" />
        <QuickAction icon={TrendingDown} label="Log Expense" desc="Record a business expense" to="/expense/new" color="var(--warning)" />
        <QuickAction icon={Users} label="Manage Contacts" desc="Sub-dealers, retailers" to="/contacts" color="var(--brand-broadband)" />
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, string> = {
    matador: 'Matador',
    olympic: 'Olympic',
    bombay: 'Bombay',
    mtb_broadband: 'Broadband',
  };
  return <span className={`badge badge-${category}`}>{map[category] ?? category}</span>;
}

function QuickAction({ icon: Icon, label, desc, to, color }: {
  icon: React.ElementType; label: string; desc: string; to: string; color: string;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="card"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-5)' }}
      onClick={() => navigate(to)}
    >
      <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{desc}</div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
