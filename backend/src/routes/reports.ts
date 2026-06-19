import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import ExcelJS from 'exceljs';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ─── GET /api/reports/due-list ────────────────────────────────────────────────
router.get('/due-list', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT c.name, c.type, c.phone, c.area, c.outstanding_balance
      FROM contacts c
      WHERE c.outstanding_balance > 0 AND c.is_active = TRUE
      ORDER BY c.outstanding_balance DESC
    `);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate due list' });
  }
});

// ─── GET /api/reports/market-sales ────────────────────────────────────────────
router.get('/market-sales', async (req: Request, res: Response): Promise<void> => {
  const { from, to, category } = req.query;
  const params: unknown[] = ['approved'];
  const conditions: string[] = ['i.status = $1'];
  let p = 2;

  if (from) { conditions.push(`i.created_at >= $${p++}`); params.push(from); }
  if (to) { conditions.push(`i.created_at <= $${p++}`); params.push(to); }
  if (category) { conditions.push(`i.category = $${p++}`); params.push(category); }

  try {
    const { rows } = await pool.query(`
      SELECT
        i.invoice_number, i.category, i.created_at,
        c.name AS contact_name,
        SUM(ii.line_total) AS total_sales,
        SUM(ii.damage_a) AS total_damage_a,
        SUM(ii.damage_b) AS total_damage_b,
        SUM(ii.commission) AS total_commission
      FROM invoices i
      LEFT JOIN contacts c ON c.id = i.contact_id
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE ${conditions.join(' AND ')}
        AND i.category IN ('matador', 'olympic', 'bombay')
      GROUP BY i.id, c.name
      ORDER BY i.created_at DESC
    `, params);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate market sales report' });
  }
});

// ─── GET /api/reports/total-bills ─────────────────────────────────────────────
router.get('/total-bills', async (req: Request, res: Response): Promise<void> => {
  const { month } = req.query; // YYYY-MM
  try {
    const { rows } = await pool.query(`
      SELECT
        i.category,
        COUNT(*) AS invoice_count,
        SUM(ii.running_bill) AS total_running_bill
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.status = 'approved'
        AND i.category = 'mtb_broadband'
        ${month ? `AND TO_CHAR(i.created_at, 'YYYY-MM') = $1` : ''}
      GROUP BY i.category
    `, month ? [month] : []);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to generate total bills' });
  }
});

// ─── GET /api/reports/cashbook-summary ────────────────────────────────────────
router.get('/cashbook-summary', async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query;
  const params: unknown[] = [];
  const conditions: string[] = [];
  let p = 1;

  if (from) { conditions.push(`entry_date >= $${p++}`); params.push(from); }
  if (to) { conditions.push(`entry_date <= $${p++}`); params.push(to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT SUM(today_income) AS total_income, SUM(today_expense) AS total_expense,
              SUM(today_due) AS total_due, MIN(entry_date) AS period_start, MAX(entry_date) AS period_end
       FROM cashbook_entries ${where}`, params
    );
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch cashbook summary' });
  }
});

// ─── GET /api/reports/export/transactions ─────────────────────────────────────
// Export all transactions to Excel
router.get('/export/transactions', async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query;
  const params: unknown[] = [];
  const conditions: string[] = [];
  let p = 1;

  if (from) { conditions.push(`i.created_at >= $${p++}`); params.push(from); }
  if (to) { conditions.push(`i.created_at <= $${p++}`); params.push(to); }
  const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(`
      SELECT
        i.invoice_number, i.category, i.status, i.created_at,
        u.full_name AS submitted_by, a.full_name AS approved_by,
        c.name AS contact_name,
        SUM(ii.line_total) AS total_amount
      FROM invoices i
      LEFT JOIN users u ON u.id = i.submitted_by
      LEFT JOIN users a ON a.id = i.approved_by
      LEFT JOIN contacts c ON c.id = i.contact_id
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE i.status = 'approved' ${where}
      GROUP BY i.id, u.full_name, a.full_name, c.name
      ORDER BY i.created_at DESC
    `, params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MCT BMS';
    const sheet = workbook.addWorksheet('Transactions');

    sheet.columns = [
      { header: 'Invoice #', key: 'invoice_number', width: 18 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Contact', key: 'contact_name', width: 24 },
      { header: 'Amount', key: 'total_amount', width: 14 },
      { header: 'Submitted By', key: 'submitted_by', width: 20 },
      { header: 'Approved By', key: 'approved_by', width: 20 },
      { header: 'Date', key: 'created_at', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

    rows.forEach((r) => {
      sheet.addRow({
        ...r,
        total_amount: parseFloat(r.total_amount || 0),
        created_at: new Date(r.created_at).toLocaleDateString(),
      });
    });

    // Totals row
    const lastRow = sheet.rowCount + 1;
    sheet.getCell(`A${lastRow}`).value = 'TOTAL';
    sheet.getCell(`A${lastRow}`).font = { bold: true };
    sheet.getCell(`D${lastRow}`).value = { formula: `SUM(D2:D${lastRow - 1})` };
    sheet.getCell(`D${lastRow}`).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=MCT-Transactions-${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Reports/export/transactions]', err);
    res.status(500).json({ success: false, error: 'Failed to generate Excel export' });
  }
});

// ─── GET /api/reports/financials/profit-loss ────────────────────────────────────
router.get('/financials/profit-loss', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: revenue } = await pool.query(`
      SELECT c.id, c.name, COALESCE(SUM(gl.credit - gl.debit), 0) AS total
      FROM chart_of_accounts c
      LEFT JOIN general_ledger gl ON gl.account_id = c.id
      WHERE c.type = 'revenue'
      GROUP BY c.id, c.name
      ORDER BY c.code ASC
    `);

    const { rows: expenses } = await pool.query(`
      SELECT c.id, c.name, COALESCE(SUM(gl.debit - gl.credit), 0) AS total
      FROM chart_of_accounts c
      LEFT JOIN general_ledger gl ON gl.account_id = c.id
      WHERE c.type = 'expense'
      GROUP BY c.id, c.name
      ORDER BY c.code ASC
    `);

    const totalRevenue = revenue.reduce((sum, r) => sum + Number(r.total), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.total), 0);

    res.json({ success: true, data: { revenue, expenses, net_income: totalRevenue - totalExpenses } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/reports/financials/balance-sheet ────────────────────────────────
router.get('/financials/balance-sheet', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows: assets } = await pool.query(`
      SELECT c.id, c.name, COALESCE(SUM(gl.debit - gl.credit), 0) AS total
      FROM chart_of_accounts c
      LEFT JOIN general_ledger gl ON gl.account_id = c.id
      WHERE c.type = 'asset'
      GROUP BY c.id, c.name
      ORDER BY c.code ASC
    `);

    const { rows: liabilities } = await pool.query(`
      SELECT c.id, c.name, COALESCE(SUM(gl.credit - gl.debit), 0) AS total
      FROM chart_of_accounts c
      LEFT JOIN general_ledger gl ON gl.account_id = c.id
      WHERE c.type = 'liability'
      GROUP BY c.id, c.name
      ORDER BY c.code ASC
    `);

    const { rows: equity } = await pool.query(`
      SELECT c.id, c.name, COALESCE(SUM(gl.credit - gl.debit), 0) AS total
      FROM chart_of_accounts c
      LEFT JOIN general_ledger gl ON gl.account_id = c.id
      WHERE c.type = 'equity'
      GROUP BY c.id, c.name
      ORDER BY c.code ASC
    `);

    // Add Net Income to Equity
    const { rows: niRow } = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN c.type = 'revenue' THEN gl.credit - gl.debit ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN c.type = 'expense' THEN gl.debit - gl.credit ELSE 0 END), 0) AS net_income
      FROM chart_of_accounts c
      JOIN general_ledger gl ON gl.account_id = c.id
    `);

    if (niRow[0].net_income != 0) {
      equity.push({ id: 'net_income', name: 'Net Income (Current Year)', total: niRow[0].net_income });
    }

    res.json({ success: true, data: { assets, liabilities, equity } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
