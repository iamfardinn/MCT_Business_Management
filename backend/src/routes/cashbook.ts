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

export default router;
