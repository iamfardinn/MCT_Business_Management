import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import invoiceRoutes from './routes/invoices';
import expenseRoutes from './routes/expenses';
import cashbookRoutes from './routes/cashbook';
import contactRoutes from './routes/contacts';
import subscriberRoutes from './routes/subscribers';
import reportRoutes from './routes/reports';
import approvalRoutes from './routes/approvals';
import daybookRoutes from './routes/daybook';
import productsRoutes from './routes/products';
import settingsRoutes from './routes/settings';
import broadbandPaymentsRoutes from './routes/broadband_payments';
import purchasesRoutes from './routes/purchases';
import accountsRoutes from './routes/accounts';
import auditRoutes from './routes/audit';

const app = express();

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // needed for Electron/Tauri
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow:
      //  • No origin at all (native IPC, server-to-server)
      //  • Exact match in ALLOWED_ORIGINS env list
      //  • Any app:// scheme (Electron custom protocol — host varies: app://, app://., etc.)
      //  • file:// (fallback Electron loads)
      const isAllowed =
        !origin ||
        allowedOrigins.includes(origin) ||
        /^app:\/\//i.test(origin) ||
        /^file:\/\//i.test(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/cashbook', cashbookRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/daybook', daybookRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/broadband_payments', broadbandPaymentsRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/audit', auditRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
