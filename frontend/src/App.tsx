import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useSocket } from './hooks/useSocket';
import { ToastContainer } from './components/ui/ToastContainer';
import { AppLayout } from './components/layout/AppLayout';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InvoiceNewPage from './pages/InvoiceNewPage';
import InvoiceListPage from './pages/InvoiceListPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import ExpenseNewPage from './pages/ExpenseNewPage';
import ContactsPage from './pages/ContactsPage';
import CashbookPage from './pages/CashbookPage';
import DaybookPage from './pages/DaybookPage';
import ProductsPage from './pages/ProductsPage';
import PurchasesPage from './pages/PurchasesPage';
import SettingsPage from './pages/SettingsPage';
import BroadbandPaymentsPage from './pages/admin/BroadbandPaymentsPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminApprovalsPage from './pages/admin/AdminApprovalsPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminSubscribersPage from './pages/admin/AdminSubscribersPage';
import ChartOfAccountsPage from './pages/admin/ChartOfAccountsPage';
import FinancialReportsPage from './pages/admin/FinancialReportsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  useSocket(); // activate socket.io connection

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Employee Routes */}
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="invoice/new" element={<InvoiceNewPage />} />
        <Route path="invoices" element={<InvoiceListPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="expense/new" element={<ExpenseNewPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="cashbook" element={<CashbookPage />} />

        {/* Shared Admin Routes */}
        <Route path="daybook" element={<RequireAdmin><DaybookPage /></RequireAdmin>} />
        <Route path="products" element={<RequireAdmin><ProductsPage /></RequireAdmin>} />
        <Route path="settings" element={<RequireAdmin><SettingsPage /></RequireAdmin>} />

        {/* Dedicated Admin Section */}
        <Route path="admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
        <Route path="admin/approvals" element={<RequireAdmin><AdminApprovalsPage /></RequireAdmin>} />
        <Route path="admin/reports" element={<RequireAdmin><AdminReportsPage /></RequireAdmin>} />
        <Route path="admin/financials" element={<RequireAdmin><FinancialReportsPage /></RequireAdmin>} />
        <Route path="admin/chart-of-accounts" element={<RequireAdmin><ChartOfAccountsPage /></RequireAdmin>} />
        <Route path="admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
        <Route path="admin/subscribers" element={<RequireAdmin><AdminSubscribersPage /></RequireAdmin>} />
        <Route path="admin/broadband_payments" element={<RequireAdmin><BroadbandPaymentsPage /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer />
    </BrowserRouter>
  );
}
