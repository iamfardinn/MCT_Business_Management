import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import { emitCashbookUpdated } from '../socket';

const router = Router();
router.use(authenticate);

// ─── GET /api/cashbook ────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.full_name AS created_by_name
       FROM cashbook_entries c
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.entry_date DESC
       LIMIT 90`
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch cashbook' });
  }
});

// ─── GET /api/cashbook/summary ────────────────────────────────────────────────
router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT
        SUM(today_income) AS total_income,
        SUM(today_expense) AS total_expense,
        SUM(today_due) AS total_due,
        (SELECT closing_balance FROM cashbook_entries ORDER BY entry_date DESC LIMIT 1) AS current_balance,
        COUNT(*) AS total_entries
      FROM cashbook_entries
      WHERE entry_date >= date_trunc('month', NOW())
    `);
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch cashbook summary' });
  }
});

// ─── POST /api/cashbook ───────────────────────────────────────────────────────
router.post('/',
  requireRole('admin'),
  [
    body('entry_date').isISO8601(),
    body('today_income').isFloat({ min: 0 }),
    body('today_expense').isFloat({ min: 0 }),
    body('today_due').isFloat({ min: 0 }),
    body('previous_cash').isFloat({ min: 0 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ success: false, error: errors.array()[0].msg }); return; }

    const { entry_date, today_income, today_expense, today_due, previous_cash, notes } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO cashbook_entries (entry_date, today_income, today_expense, today_due, previous_cash, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [entry_date, today_income, today_expense, today_due, previous_cash, notes, req.user!.sub]
      );
      await writeAudit({ tableName: 'cashbook_entries', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
      emitCashbookUpdated(rows[0]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === '23505') { res.status(409).json({ success: false, error: 'Cashbook entry already exists for this date' }); return; }
      res.status(500).json({ success: false, error: 'Failed to create cashbook entry' });
    }
  }
);

// ─── PATCH /api/cashbook/:id ──────────────────────────────────────────────────
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { today_income, today_expense, today_due, previous_cash, notes } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM cashbook_entries WHERE id = $1', [id]);
    if (!existing[0]) { res.status(404).json({ success: false, error: 'Entry not found' }); return; }

    const { rows } = await pool.query(
      `UPDATE cashbook_entries SET
         today_income = COALESCE($1, today_income),
         today_expense = COALESCE($2, today_expense),
         today_due = COALESCE($3, today_due),
         previous_cash = COALESCE($4, previous_cash),
         notes = COALESCE($5, notes)
       WHERE id = $6 RETURNING *`,
      [today_income, today_expense, today_due, previous_cash, notes, id]
    );
    await writeAudit({ tableName: 'cashbook_entries', recordId: id, action: 'UPDATE', actorId: req.user!.sub, oldValues: existing[0], newValues: rows[0] });
    emitCashbookUpdated(rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update cashbook entry' });
  }
});
// ─── GET /api/cashbook/transactions ─────────────────────────────────────────────
router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const { type, group_name, date, search, page = '1', limit = '50' } = req.query;
  const conditions = [];
  const params: any[] = [];
  let p = 1;

  if (type) { conditions.push(`type = $${p++}`); params.push(type); }
  if (group_name) { conditions.push(`group_name = $${p++}`); params.push(group_name); }
  if (date) { conditions.push(`transaction_date = $${p++}`); params.push(date); }
  if (search) {
    conditions.push(`(contact_name ILIKE $${p} OR note ILIKE $${p} OR collected_by ILIKE $${p})`);
    params.push(`%${search}%`);
    p++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = parseInt(limit as string, 10);
  const offset = (parseInt(page as string, 10) - 1) * limitNum;

  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM cashbook_transactions ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const { rows } = await pool.query(
      `SELECT * FROM cashbook_transactions ${where} ORDER BY transaction_date DESC, id DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, limitNum, offset]
    );
    res.json({ success: true, data: rows, total, page: parseInt(page as string, 10), limit: limitNum });
  } catch (err) {
    console.error('[CashbookTransactions/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// ─── POST /api/cashbook/transactions ────────────────────────────────────────────
router.post('/transactions', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const {
    transaction_date, type, group_name, sub_group, contact_name,
    debit, credit, amount, actual_amount, note, collected_by
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO cashbook_transactions (
         transaction_date, type, group_name, sub_group, contact_name,
         debit, credit, amount, actual_amount, note, collected_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        transaction_date || new Date().toISOString().split('T')[0], type, group_name, sub_group, contact_name,
        debit, credit, amount || 0, actual_amount || 0, note, collected_by
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[CashbookTransactions/POST]', err);
    res.status(500).json({ success: false, error: 'Failed to create transaction' });
  }
});

// ─── PATCH /api/cashbook/transactions/:id ───────────────────────────────────────
router.patch('/transactions/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const updates = req.body;
  const allowedKeys = [
    'transaction_date', 'type', 'group_name', 'sub_group', 'contact_name',
    'debit', 'credit', 'amount', 'actual_amount', 'note', 'collected_by'
  ];

  const keys = Object.keys(updates).filter((k) => allowedKeys.includes(k));
  if (keys.length === 0) { res.status(400).json({ success: false, error: 'No valid fields' }); return; }

  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => updates[k]);

  try {
    const { rows } = await pool.query(
      `UPDATE cashbook_transactions SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) { res.status(404).json({ success: false, error: 'Transaction not found' }); return; }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[CashbookTransactions/PATCH]', err);
    res.status(500).json({ success: false, error: 'Failed to update transaction' });
  }
});

// ─── DELETE /api/cashbook/transactions/:id ──────────────────────────────────────
router.delete('/transactions/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rowCount } = await pool.query('DELETE FROM cashbook_transactions WHERE id = $1', [req.params.id]);
    if (rowCount === 0) { res.status(404).json({ success: false, error: 'Transaction not found' }); return; }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    console.error('[CashbookTransactions/DELETE]', err);
    res.status(500).json({ success: false, error: 'Failed to delete transaction' });
  }
});

export default router;
