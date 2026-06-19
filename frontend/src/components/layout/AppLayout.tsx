import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Receipt, Users, BookOpen,
  CheckSquare, BarChart3, UserCog, Wifi, LogOut, Bell, Search, Package, Settings, ShoppingCart, PieChart, Network, Shield
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import clsx from 'clsx';

function NavItem({ to, icon: Icon, label, badge }: {
  to: string; icon: React.ElementType; label: string; badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => clsx('nav-item', isActive && 'active')}
    >
      <Icon size={17} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: pendingCount } = useQuery({
    queryKey: ['approvals', 'count'],
    queryFn: async () => {
      const r = await api.get('/approvals?limit=1');
      return r.data.total as number;
    },
    enabled: user?.role === 'admin',
    refetchInterval: 30_000,
  });

  const initials = user?.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'U';

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-layout">
      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">M</div>
          <div>
            <div className="sidebar-logo-text">MCT Group</div>
            <div className="sidebar-logo-sub">Business Manager</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-label">Main</div>
            <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavItem to="/invoices" icon={FileText} label="Invoices" />
            <NavItem to="/invoice/new" icon={Receipt} label="New Invoice" />
            <NavItem to="/expense/new" icon={BookOpen} label="Log Expense" />
            <NavItem to="/purchases" icon={ShoppingCart} label="Purchases" />
            <NavItem to="/contacts" icon={Users} label="Contacts" />
            <NavItem to="/cashbook" icon={BookOpen} label="Cashbook" />
          </div>

          {user?.role === 'admin' && (
            <div className="nav-section">
              <div className="nav-section-label">Administration</div>
              <NavItem to="/admin" icon={LayoutDashboard} label="Admin Dashboard" />
              <NavItem to="/admin/approvals" icon={CheckSquare} label="Approvals" badge={pendingCount} />
              <NavItem to="/daybook" icon={Receipt} label="Daybook" />
              <NavItem to="/products" icon={Package} label="Products" />
              <NavItem to="/admin/reports" icon={BarChart3} label="General Reports" />
              <NavItem to="/admin/financials" icon={PieChart} label="Financial Reports" />
              <NavItem to="/admin/chart-of-accounts" icon={Network} label="Chart of Accounts" />
              <NavItem to="/admin/subscribers" icon={Wifi} label="Subscribers" />
              <NavItem to="/admin/broadband_payments" icon={Wifi} label="Broadband Payments" />
              <NavItem to="/admin/users" icon={UserCog} label="Users" />
              <NavItem to="/admin/audit-logs" icon={Shield} label="Audit Logs" />
              <NavItem to="/settings" icon={Settings} label="Settings" />
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card" onClick={handleLogout} title="Click to log out">
            <div className="user-avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name truncate">{user?.full_name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
            <LogOut size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─────────────────────────────────────────── */}
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-search">
            <Search size={15} className="search-icon" />
            <input type="search" placeholder="Search invoices, contacts..." id="global-search" />
          </div>
          <div className="topbar-actions">
            <button className="topbar-icon-btn" id="notifications-btn" aria-label="Notifications">
              <Bell size={17} />
              {(pendingCount ?? 0) > 0 && <span className="dot" />}
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
