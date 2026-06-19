import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { body, validationResult } from 'express-validator';
import pool, { withTransaction } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import ExcelJS from 'exceljs';

const router = Router();
router.use(authenticate, requireRole('admin'));

const VALID_VOUCHER_TYPES = ['Receipt', 'Payment', 'Contra', 'Journal', 'Sales', 'Purchase'];

// ─── GET /api/daybook ─────────────────────────────────────────────────────────
// Tally-style daybook: chronological list of voucher entries with debit/credit,
// opening + closing balance for the selected period, and per-page totals.
//
// Query params: from, to (YYYY-MM-DD), voucher_type, source, page, limit, sort (asc|desc)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { from, to, voucher_type, source, page = '1', limit = '200', sort = 'asc' } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (from) { conditions.push(`entry_date >= $${p++}`); params.push(from); }
  if (to) { conditions.push(`entry_date <= $${p++}`); params.push(to); }
  if (voucher_type && VALID_VOUCHER_TYPES.includes(voucher_type as string)) {
    conditions.push(`voucher_type = $${p++}`);
    params.push(voucher_type);
  }
  if (source) { conditions.push(`source = $${p++}`); params.push(source); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 200, 1), 500);
  const offset = (pageNum - 1) * limitNum;
  const sortDir = sort === 'desc' ? 'DESC' : 'ASC';

  try {
    const { rows } = await pool.query(
      `SELECT id, entry_date, voucher_type, voucher_no, particulars,
              group_name, narration, debit_amount, credit_amount,
              debit_ledger, credit_ledger, voucher_group, source
       FROM daybook_entries
       ${where}
       ORDER BY entry_date ${sortDir}, voucher_no ${sortDir}
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limitNum, offset]
    );

    const { rows: totalRows } = await pool.query(
      `SELECT
         COALESCE(SUM(debit_amount), 0)  AS total_debit,
         COALESCE(SUM(credit_amount), 0) AS total_credit,
         COUNT(*)                         AS total
       FROM daybook_entries ${where}`,
      params
    );

    let openingBalance = 0;
    if (from) {
      const { rows: openRows } = await pool.query(
        `SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS opening
         FROM daybook_entries
         WHERE entry_date < $1`,
        [from]
      );
      openingBalance = parseFloat(openRows[0].opening);
    }

    const totalDebit = parseFloat(totalRows[0].total_debit);
    const totalCredit = parseFloat(totalRows[0].total_credit);

    res.json({
      success: true,
      data: rows,
      totals: {
        total_debit: totalDebit,
        total_credit: totalCredit,
        opening_balance: openingBalance,
        closing_balance: openingBalance + totalDebit - totalCredit,
      },
      total: parseInt(totalRows[0].total, 10),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[Daybook/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch daybook' });
  }
});

// ─── GET /api/daybook/export ──────────────────────────────────────────────────
// Export the Daybook as a styled Excel (.xlsx) file.
// Supports same filters as GET /api/daybook (from, to, voucher_type, source).
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const { from, to, voucher_type, source } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (from) { conditions.push(`entry_date >= $${p++}`); params.push(from); }
  if (to)   { conditions.push(`entry_date <= $${p++}`); params.push(to); }
  if (voucher_type && VALID_VOUCHER_TYPES.includes(voucher_type as string)) {
    conditions.push(`voucher_type = $${p++}`);
    params.push(voucher_type);
  }
  if (source) { conditions.push(`source = $${p++}`); params.push(source); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT id, entry_date, voucher_type, voucher_no, particulars,
              narration, debit_amount, credit_amount, debit_ledger, credit_ledger, source
       FROM daybook_entries
       ${where}
       ORDER BY entry_date ASC, voucher_no ASC`,
      params
    );

    // Opening balance
    let openingBalance = 0;
    if (from) {
      const { rows: openRows } = await pool.query(
        `SELECT COALESCE(SUM(debit_amount - credit_amount), 0) AS opening FROM daybook_entries WHERE entry_date < $1`,
        [from]
      );
      openingBalance = parseFloat(openRows[0].opening);
    }

    // Build Excel workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MCT BMS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Daybook', { pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true } });

    // ── Title header ──
    const periodStr = from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : 'All Dates';
    const vtypeStr  = voucher_type ? ` | ${voucher_type} Vouchers` : '';
    ws.mergeCells('A1:H1');
    ws.getCell('A1').value = 'MCT Group — Daybook';
    ws.getCell('A1').font  = { bold: true, size: 16, color: { argb: 'FF1E3A5F' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:H2');
    ws.getCell('A2').value = `Period: ${periodStr}${vtypeStr}  |  Generated: ${new Date().toLocaleString('en-BD')}`;
    ws.getCell('A2').font  = { size: 10, color: { argb: 'FF6B7280' }, italic: true };
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.addRow([]); // spacer

    // ── Column headers ──
    const headerRow = ws.addRow(['Date', 'Particulars', 'Voucher Type', 'Voucher No', 'Source', 'Debit (৳)', 'Credit (৳)', 'Balance (৳)']);
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FF1F2937' }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF374151' } } };
      cell.alignment = { horizontal: colNumber >= 6 ? 'right' : 'left' };
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];

    // Opening balance row
    if (openingBalance !== 0) {
      const obRow = ws.addRow(['', 'Opening Balance', '', '', '', '', '', openingBalance]);
      obRow.eachCell(c => { c.font = { italic: true, color: { argb: 'FF6B7280' }, size: 9 }; });
      obRow.getCell(8).numFmt = '#,##0.00';
      obRow.getCell(8).alignment = { horizontal: 'right' };
    }

    // ── Data rows with date grouping ──
    let currentDate = '';
    let dayDebit = 0, dayCredit = 0;
    let dayStartRow = 0;
    let runningBalance = openingBalance;
    let totalDebit = 0, totalCredit = 0;

    const flushDaySubtotal = (label: string) => {
      if (!currentDate) return;
      const subRow = ws.addRow([`${label} Subtotal`, '', '', '', '', dayDebit, dayCredit, '']);
      subRow.eachCell((c, ci) => {
        c.font  = { bold: true, size: 9, color: { argb: 'FF374151' } };
        c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        if (ci === 6) { c.numFmt = '#,##0.00'; c.font.color = { argb: 'FF15803D' }; }
        if (ci === 7) { c.numFmt = '#,##0.00'; c.font.color = { argb: 'FFB91C1C' }; }
        c.alignment = { horizontal: ci >= 6 ? 'right' : 'left' };
      });
      dayDebit = 0; dayCredit = 0; dayStartRow = 0;
    };

    for (const row of rows) {
      const dateStr = new Date(row.entry_date).toLocaleDateString('en-BD', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

      if (row.entry_date !== currentDate) {
        flushDaySubtotal(currentDate ? new Date(currentDate).toLocaleDateString('en-BD', { day:'2-digit', month:'short' }) : '');
        currentDate = row.entry_date;
        dayStartRow = ws.rowCount + 1;

        // Date group header
        const dgRow = ws.addRow([dateStr, '', '', '', '', '', '', '']);
        dgRow.eachCell((c) => {
          c.font  = { bold: true, size: 9.5, color: { argb: 'FF1F2937' } };
          c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF5' } };
          c.border = { top: { style: 'thin', color: { argb: 'FFCBD5E0' } } };
        });
      }

      const dr = parseFloat(row.debit_amount)  || 0;
      const cr = parseFloat(row.credit_amount) || 0;
      runningBalance += dr - cr;
      dayDebit   += dr; dayCredit   += cr;
      totalDebit += dr; totalCredit += cr;

      const dataRow = ws.addRow([
        '',
        row.particulars || row.debit_ledger || '—',
        row.voucher_type,
        row.voucher_no || '—',
        row.source,
        dr > 0 ? dr : null,
        cr > 0 ? cr : null,
        runningBalance,
      ]);

      dataRow.getCell(1).value = '';
      dataRow.getCell(6).numFmt = '#,##0.00'; dataRow.getCell(6).alignment = { horizontal: 'right' };
      dataRow.getCell(7).numFmt = '#,##0.00'; dataRow.getCell(7).alignment = { horizontal: 'right' };
      dataRow.getCell(8).numFmt = '#,##0.00'; dataRow.getCell(8).alignment = { horizontal: 'right' };
      dataRow.getCell(6).font  = { color: { argb: 'FF15803D' } };
      dataRow.getCell(7).font  = { color: { argb: 'FFB91C1C' } };
      dataRow.getCell(8).font  = { bold: true, color: { argb: runningBalance >= 0 ? 'FF1D4ED8' : 'FFB91C1C' } };

      if (row.narration) {
        const nRow = ws.addRow(['', `  ↳ ${row.narration}`, '', '', '', '', '', '']);
        nRow.getCell(2).font = { italic: true, color: { argb: 'FF9CA3AF' }, size: 9 };
      }
    }

    // Flush last day subtotal
    if (currentDate) {
      flushDaySubtotal(new Date(currentDate).toLocaleDateString('en-BD', { day:'2-digit', month:'short' }));
    }

    // Grand total row
    const gtRow = ws.addRow(['Grand Total', '', '', '', '', totalDebit, totalCredit, runningBalance]);
    gtRow.eachCell((c, ci) => {
      c.font = { bold: true, size: 11, color: { argb: 'FF111827' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      c.border = { top: { style: 'double', color: { argb: 'FF1D4ED8' } } };
      if (ci === 6) { c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; c.font.color = { argb: 'FF15803D' }; }
      if (ci === 7) { c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; c.font.color = { argb: 'FFB91C1C' }; }
      if (ci === 8) { c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; c.font.color = { argb: 'FF1D4ED8' }; }
    });

    // Column widths
    ws.columns = [
      { width: 22 }, { width: 36 }, { width: 14 },
      { width: 18 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 18 },
    ];

    // Send response
    const filename = `MCT-Daybook-${(from || 'all').toString().replace(/-/g,'')}-${(to || 'all').toString().replace(/-/g,'')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[Daybook/EXPORT]', err);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

// ─── POST /api/daybook ────────────────────────────────────────────────────────
// Create a DOUBLE-ENTRY voucher (admin only). Stored as two paired rows in
// cashbook_transactions sharing one voucher_group:
//   • debit row  -> debit_amount  = amount, particulars = debit_ledger
//   • credit row -> credit_amount = amount, particulars = credit_ledger
router.post(
  '/',
  [
    body('entry_date').isISO8601().withMessage('Valid date required'),
    body('voucher_type').isIn(VALID_VOUCHER_TYPES),
    body('debit_ledger').trim().notEmpty().withMessage('Debit ledger required'),
    body('credit_ledger').trim().notEmpty().withMessage('Credit ledger required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: errors.array()[0].msg });
      return;
    }

    const { entry_date, voucher_type, debit_ledger, credit_ledger, amount, narration } = req.body;

    if (String(debit_ledger).trim() === String(credit_ledger).trim()) {
      res.status(400).json({ success: false, error: 'Debit and credit ledgers must differ' });
      return;
    }

    try {
      const voucherGroup = randomUUID();
      const voucherNo = `MJV-${Date.now().toString().slice(-8)}`;

      const created = await withTransaction(async (client) => {
        // Debit leg
        const debitRow = await client.query(
          `INSERT INTO cashbook_transactions
             (transaction_date, type, voucher_type, voucher_no, voucher_group,
              contact_name, group_name, note, debit_ledger, credit_ledger,
              amount, actual_amount, debit_amount, credit_amount, created_by)
           VALUES ($1,'manual',$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$10,0,$11)
           RETURNING *`,
          [entry_date, voucher_type, voucherNo, voucherGroup, debit_ledger,
           voucher_type, narration || null, debit_ledger, credit_ledger, amount, req.user!.sub]
        );

        // Credit leg
        await client.query(
          `INSERT INTO cashbook_transactions
             (transaction_date, type, voucher_type, voucher_no, voucher_group,
              contact_name, group_name, note, debit_ledger, credit_ledger,
              amount, actual_amount, debit_amount, credit_amount, created_by)
           VALUES ($1,'manual',$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,0,$10,$11)`,
          [entry_date, voucher_type, voucherNo, voucherGroup, credit_ledger,
           voucher_type, narration || null, debit_ledger, credit_ledger, amount, req.user!.sub]
        );

        return debitRow.rows[0];
      });

      await writeAudit({
        tableName: 'cashbook_transactions', recordId: created.id, action: 'INSERT',
        actorId: req.user!.sub, newValues: created, ipAddress: req.ip,
      });

      res.status(201).json({ success: true, data: created, message: 'Voucher created' });
    } catch (err) {
      console.error('[Daybook/POST]', err);
      res.status(500).json({ success: false, error: 'Failed to create voucher' });
    }
  }
);

// ─── PATCH /api/daybook/:id ───────────────────────────────────────────────────
// Edit a voucher. `source` (body or query) tells us where it lives:
//   • cashbook -> edit the manual voucher (both legs if paired)
//   • invoice  -> edit the underlying approved invoice (admin only)
//   • expense  -> not editable here
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const source = (req.body.source || req.query.source) as string;

  try {
    // ── Invoice-sourced voucher ──
    if (source === 'invoice') {
      const { entry_date, narration, amount } = req.body;
      const { rows: existing } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (!existing[0]) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE invoices SET
             created_at = COALESCE($1, created_at),
             notes      = COALESCE($2, notes)
           WHERE id = $3`,
          [entry_date || null, narration ?? null, id]
        );

        if (amount !== undefined && amount !== null && amount !== '') {
          await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
          await client.query(
            `INSERT INTO invoice_items (invoice_id, product_name, line_total)
             VALUES ($1, 'Daybook Adjustment', $2)`,
            [id, amount]
          );
        }
      });

      await writeAudit({
        tableName: 'invoices', recordId: id, action: 'UPDATE',
        actorId: req.user!.sub, oldValues: existing[0], newValues: req.body, ipAddress: req.ip,
      });

      res.json({ success: true, message: 'Invoice voucher updated' });
      return;
    }

    // ── Expense-sourced voucher: read-only here ──
    if (source === 'expense') {
      res.status(400).json({ success: false, error: 'Edit expenses from the Expenses page' });
      return;
    }

    // ── Manual cashbook voucher ──
    const { entry_date, voucher_type, debit_ledger, credit_ledger, amount, narration } = req.body;
    const { rows: existing } = await pool.query('SELECT * FROM cashbook_transactions WHERE id = $1', [id]);
    if (!existing[0]) { res.status(404).json({ success: false, error: 'Voucher not found' }); return; }

    const group = existing[0].voucher_group;

    await withTransaction(async (client) => {
      if (group) {
        await client.query(
          `UPDATE cashbook_transactions SET
             transaction_date = COALESCE($1, transaction_date),
             voucher_type     = COALESCE($2, voucher_type),
             debit_ledger     = COALESCE($3, debit_ledger),
             credit_ledger    = COALESCE($4, credit_ledger),
             note             = COALESCE($5, note),
             amount           = COALESCE($6, amount),
             actual_amount    = COALESCE($6, actual_amount),
             debit_amount     = CASE WHEN debit_amount  > 0 THEN COALESCE($6, debit_amount)  ELSE 0 END,
             credit_amount    = CASE WHEN credit_amount > 0 THEN COALESCE($6, credit_amount) ELSE 0 END,
             contact_name     = CASE WHEN debit_amount > 0 THEN COALESCE($3, contact_name)
                                     ELSE COALESCE($4, contact_name) END
           WHERE voucher_group = $7`,
          [entry_date || null, voucher_type || null, debit_ledger || null,
           credit_ledger || null, narration ?? null, amount ?? null, group]
        );
      } else {
        await client.query(
          `UPDATE cashbook_transactions SET
             transaction_date = COALESCE($1, transaction_date),
             voucher_type     = COALESCE($2, voucher_type),
             note             = COALESCE($3, note)
           WHERE id = $4`,
          [entry_date || null, voucher_type || null, narration ?? null, id]
        );
      }
    });

    await writeAudit({
      tableName: 'cashbook_transactions', recordId: id, action: 'UPDATE',
      actorId: req.user!.sub, oldValues: existing[0], newValues: req.body, ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Voucher updated' });
  } catch (err) {
    console.error('[Daybook/PATCH]', err);
    res.status(500).json({ success: false, error: 'Failed to update voucher' });
  }
});

// ─── DELETE /api/daybook/:id ──────────────────────────────────────────────────
// Delete a MANUAL cashbook voucher only (both legs if paired).
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM cashbook_transactions WHERE id = $1', [id]);
    if (!existing[0]) { res.status(404).json({ success: false, error: 'Voucher not found' }); return; }

    if (existing[0].type !== 'manual') {
      res.status(400).json({ success: false, error: 'Only manually-created vouchers can be deleted here' });
      return;
    }

    const group = existing[0].voucher_group;
    if (group) {
      await pool.query('DELETE FROM cashbook_transactions WHERE voucher_group = $1', [group]);
    } else {
      await pool.query('DELETE FROM cashbook_transactions WHERE id = $1', [id]);
    }

    await writeAudit({
      tableName: 'cashbook_transactions', recordId: id, action: 'DELETE',
      actorId: req.user!.sub, oldValues: existing[0], ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Voucher deleted' });
  } catch (err) {
    console.error('[Daybook/DELETE]', err);
    res.status(500).json({ success: false, error: 'Failed to delete voucher' });
  }
});

export default router;
