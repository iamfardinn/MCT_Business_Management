import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ─── GET /api/broadband_payments ─────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { search, month_name, group_name } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (search) {
    conditions.push(`(client_name ILIKE $${p} OR address ILIKE $${p})`);
    params.push(`%${search}%`);
    p++;
  }
  if (month_name) {
    conditions.push(`month_name = $${p++}`);
    params.push(month_name);
  }
  if (group_name) {
    conditions.push(`group_name = $${p++}`);
    params.push(group_name);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT * FROM broadband_payments ${where} ORDER BY pay_date DESC NULLS LAST, id DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[BroadbandPayments/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch broadband payments' });
  }
});

// ─── POST /api/broadband_payments ────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    month_name, group_name, monthly_charge, client_name, address,
    pay_date, running_bill, payment_amount, total_balance, status, comments
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO broadband_payments (
         month_name, group_name, monthly_charge, client_name, address,
         pay_date, running_bill, payment_amount, total_balance, status, comments
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        month_name, group_name, monthly_charge || 0, client_name, address,
        pay_date || null, running_bill || 0, payment_amount || 0, total_balance || 0, status, comments
      ]
    );

    // Skip audit for simplicity, or uncomment if desired
    // await writeAudit({ tableName: 'broadband_payments', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[BroadbandPayments/POST]', err);
    res.status(500).json({ success: false, error: 'Failed to create broadband payment' });
  }
});

// ─── PATCH /api/broadband_payments/:id ───────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const updates = req.body;
  const allowedKeys = [
    'month_name', 'group_name', 'monthly_charge', 'client_name', 'address',
    'pay_date', 'running_bill', 'payment_amount', 'total_balance', 'status', 'comments'
  ];

  const keys = Object.keys(updates).filter((k) => allowedKeys.includes(k));
  if (keys.length === 0) {
    res.status(400).json({ success: false, error: 'No valid fields provided for update' });
    return;
  }

  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => updates[k]);

  try {
    const oldRes = await pool.query('SELECT * FROM broadband_payments WHERE id = $1', [req.params.id]);
    if (oldRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE broadband_payments SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    await writeAudit({
      tableName: 'broadband_payments',
      recordId: req.params.id,
      action: 'UPDATE',
      actorId: req.user!.sub,
      oldValues: oldRes.rows[0],
      newValues: rows[0],
    });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[BroadbandPayments/PATCH]', err);
    res.status(500).json({ success: false, error: 'Failed to update payment' });
  }
});

// ─── DELETE /api/broadband_payments/:id ──────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const oldRes = await pool.query('SELECT * FROM broadband_payments WHERE id = $1', [req.params.id]);
    if (oldRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    await pool.query('DELETE FROM broadband_payments WHERE id = $1', [req.params.id]);

    await writeAudit({
      tableName: 'broadband_payments',
      recordId: req.params.id,
      action: 'DELETE',
      actorId: req.user!.sub,
      oldValues: oldRes.rows[0],
      newValues: null,
    });

    res.json({ success: true, message: 'Payment deleted successfully' });
  } catch (err) {
    console.error('[BroadbandPayments/DELETE]', err);
    res.status(500).json({ success: false, error: 'Failed to delete payment' });
  }
});

export default router;
