import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import { emitNewSubmission, emitApproved, emitRejected } from '../socket';

const router = Router();
router.use(authenticate);

// ─── GET /api/expenses ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { status, category, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  const params: unknown[] = [];
  const conditions: string[] = [];
  let p = 1;

  if (req.user!.role === 'employee') {
    conditions.push(`submitted_by = $${p++}`);
    params.push(req.user!.sub);
  }
  if (status) { conditions.push(`status = $${p++}`); params.push(status); }
  if (category) { conditions.push(`category = $${p++}`); params.push(category); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT e.*, u.full_name AS submitted_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.submitted_by
       ${where} ORDER BY e.expense_date DESC LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit as string), offset]
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM expenses e ${where}`, params);
    res.json({ success: true, data: rows, total: parseInt(countRows[0].count), page: parseInt(page as string), limit: parseInt(limit as string) });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch expenses' });
  }
});

// ─── POST /api/expenses ───────────────────────────────────────────────────────
router.post('/',
  [
    body('category').isIn(['transport_bill','labor_bill','carrying_cost','employee_payroll','salary_adjustment','withdraw_family','personal_withdrawal','other']),
    body('amount').isFloat({ min: 0.01 }),
    body('expense_date').isISO8601(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ success: false, error: errors.array()[0].msg }); return; }

    const { category, amount, description, expense_date } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO expenses (category, amount, description, expense_date, submitted_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [category, amount, description, expense_date, req.user!.sub]
      );
      await writeAudit({ tableName: 'expenses', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
      emitNewSubmission('expense', rows[0]);
      res.status(201).json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to create expense' });
    }
  }
);

// ─── PATCH /api/expenses/:id/approve ─────────────────────────────────────────
router.patch('/:id/approve', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
    if (!existing[0]) { res.status(404).json({ success: false, error: 'Expense not found' }); return; }
    if (existing[0].status !== 'pending') { res.status(400).json({ success: false, error: 'Not pending' }); return; }

    const { rows } = await pool.query(
      `UPDATE expenses SET status = 'approved', approved_by = $1, approved_at = NOW() WHERE id = $2 RETURNING *`,
      [req.user!.sub, id]
    );
    await pool.query(`INSERT INTO approval_records (record_type, record_id, action, actor_id) VALUES ('expense', $1, 'approve', $2)`, [id, req.user!.sub]);
    await writeAudit({ tableName: 'expenses', recordId: id, action: 'APPROVE', actorId: req.user!.sub });
    emitApproved(existing[0].submitted_by, 'expense', id);
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to approve expense' });
  }
});

// ─── PATCH /api/expenses/:id/reject ──────────────────────────────────────────
router.patch('/:id/reject', requireRole('admin'),
  [body('reason').trim().notEmpty()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ success: false, error: errors.array()[0].msg }); return; }

    const { id } = req.params;
    const { reason } = req.body;
    try {
      const { rows: existing } = await pool.query('SELECT * FROM expenses WHERE id = $1', [id]);
      if (!existing[0]) { res.status(404).json({ success: false, error: 'Expense not found' }); return; }

      const { rows } = await pool.query(
        `UPDATE expenses SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING *`,
        [reason, id]
      );
      await pool.query(`INSERT INTO approval_records (record_type, record_id, action, actor_id, reason) VALUES ('expense', $1, 'reject', $2, $3)`, [id, req.user!.sub, reason]);
      await writeAudit({ tableName: 'expenses', recordId: id, action: 'REJECT', actorId: req.user!.sub });
      emitRejected(existing[0].submitted_by, 'expense', id, reason);
      res.json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to reject expense' });
    }
  }
);

// ─── DELETE /api/expenses/:id ─────────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    await writeAudit({ tableName: 'expenses', recordId: req.params.id, action: 'DELETE', actorId: req.user!.sub });
    res.json({ success: true, data: null });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete expense' });
  }
});

export default router;
