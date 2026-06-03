import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Users, CheckCircle, Clock, DollarSign, FileText, Wifi } from 'lucide-react';
import { format } from 'date-fns';
import api from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboardPage() {
  const navigate = useNavigate();

  const { data: summary } = useQuery({
    queryKey: ['cashbook', 'summary'],
    queryFn: async () => (await api.get('/cashbook/summary')).data.data,
  });

  const { data: pending } = useQuery({
    queryKey: ['approvals', 'count'],
    queryFn: async () => (await api.get('/approvals?limit=1')).data,
    refetchInterval: 15_000,
  });

  const { data: recentApprovals } = useQuery({
    queryKey: ['approvals', 'recent'],
    queryFn: async () => (await api.get('/approvals?limit=5')).data.data,
    refetchInterval: 15_000,
  });

  const fmt = (n: number | null | undefined) =>
    `৳${Number(n ?? 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">{format(new Date(), 'EEEE, dd MMMM yyyy')} — Full system overview</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-indicator">
            <span className="live-dot" />
            Live
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-6">
        {[
          { label: 'Current Balance',   value: fmt(summary?.current_balance),  icon: DollarSign, color: 'var(--accent-primary)' },
          { label: 'Month Income',      value: fmt(summary?.total_income),      icon: TrendingUp,  color: 'var(--success)' },
          { label: 'Month Expense',     value: fmt(summary?.total_expense),     icon: TrendingDown,color: 'var(--danger)' },
          { label: 'Pending Approvals', value: String(pending?.total ?? 0),     icon: Clock,       color: 'var(--warning)' },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div style={{ position: 'absolute', right: 'var(--space-5)', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: 'var(--radius-md)', background: `${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              <s.icon size={20} />
            </div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        {/* Pending Approvals Feed */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Clock size={16} /> Pending Approvals</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/approvals')}>View All</button>
          </div>
          {recentApprovals?.length > 0 ? (
            <div>
              {recentApprovals.map((item: { id: string; record_type: string; ref_number: string; category?: string; submitted_by_name: string; amount?: number; created_at: string }) => (
                <div key={item.id} className="approval-item">
                  <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', flexShrink: 0 }}>
                    {item.record_type === 'invoice' ? <FileText size={16} /> : <TrendingDown size={16} />}
                  </div>
                  <div className="approval-info">
                    <div className="approval-title">
                      {item.record_type === 'invoice' ? item.ref_number : `Expense — ${item.ref_number}`}
                    </div>
                    <div className="approval-meta">
                      {item.submitted_by_name} · {format(new Date(item.created_at), 'dd MMM, hh:mm a')}
                      {item.amount && ` · ৳${Number(item.amount).toLocaleString()}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
              <div className="empty-state-icon"><CheckCircle size={20} /></div>
              <div className="empty-state-title">All caught up!</div>
            </div>
          )}
        </div>

        {/* Quick Admin Actions */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Quick Actions</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {[
              { label: 'Approval Queue', desc: `${pending?.total ?? 0} pending`, icon: CheckCircle, to: '/admin/approvals', color: 'var(--warning)' },
              { label: 'Financial Reports', desc: 'Export & analysis', icon: TrendingUp, to: '/admin/reports', color: 'var(--accent-primary)' },
              { label: 'Broadband Subscribers', desc: 'Manage MTB clients', icon: Wifi, to: '/admin/subscribers', color: 'var(--brand-broadband)' },
              { label: 'User Management', desc: 'Manage accounts', icon: Users, to: '/admin/users', color: 'var(--brand-bombay)' },
            ].map((a) => (
              <button
                key={a.to}
                className="btn btn-secondary"
                style={{ justifyContent: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)' }}
                onClick={() => navigate(a.to)}
              >
                <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: `${a.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color }}>
                  <a.icon size={15} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{a.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
