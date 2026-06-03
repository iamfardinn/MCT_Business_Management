import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

// ─── GET /api/subscribers ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { status, area_group, search, page = '1', limit = '50' } = req.query;
  const params: unknown[] = [];
  const conditions: string[] = [];
  let p = 1;

  if (status) { conditions.push(`status = $${p++}`); params.push(status); }
  if (area_group) { conditions.push(`area_group = $${p++}`); params.push(area_group); }
  if (search) { conditions.push(`(name ILIKE $${p++} OR address ILIKE $${p})`); params.push(`%${search}%`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM subscribers ${where} ORDER BY name LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit as string), offset]
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM subscribers ${where}`, params);
    res.json({ success: true, data: rows, total: parseInt(countRows[0].count) });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch subscribers' });
  }
});

// ─── GET /api/subscribers/due-list ───────────────────────────────────────────
router.get('/due-list', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, address, area_group, running_balance, monthly_bill, status
       FROM subscribers
       WHERE running_balance > 0 AND status = 'active'
       ORDER BY running_balance DESC`
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch due list' });
  }
});

// ─── POST /api/subscribers ────────────────────────────────────────────────────
router.post('/',
  requireRole('admin'),
  [
    body('name').trim().notEmpty(),
    body('address').trim().notEmpty(),
    body('monthly_bill').isFloat({ min: 0 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ success: false, error: errors.array()[0].msg }); return; }

    const { name, phone, address, area_group, monthly_bill, connection_date } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO subscribers (name, phone, address, area_group, monthly_bill, connection_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [name, phone, address, area_group, monthly_bill, connection_date, req.user!.sub]
      );
      await writeAudit({ tableName: 'subscribers', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
      res.status(201).json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to create subscriber' });
    }
  }
);

// ─── PATCH /api/subscribers/:id ───────────────────────────────────────────────
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, phone, address, area_group, status, monthly_bill, running_balance, connection_date } = req.body;
  try {
    const { rows: existing } = await pool.query('SELECT * FROM subscribers WHERE id = $1', [id]);
    if (!existing[0]) { res.status(404).json({ success: false, error: 'Subscriber not found' }); return; }

    const { rows } = await pool.query(
      `UPDATE subscribers SET
         name = COALESCE($1, name), phone = COALESCE($2, phone),
         address = COALESCE($3, address), area_group = COALESCE($4, area_group),
         status = COALESCE($5, status), monthly_bill = COALESCE($6, monthly_bill),
         running_balance = COALESCE($7, running_balance), connection_date = COALESCE($8, connection_date)
       WHERE id = $9 RETURNING *`,
      [name, phone, address, area_group, status, monthly_bill, running_balance, connection_date, id]
    );
    await writeAudit({ tableName: 'subscribers', recordId: id, action: 'UPDATE', actorId: req.user!.sub, oldValues: existing[0], newValues: rows[0] });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update subscriber' });
  }
});

// ─── DELETE /api/subscribers/:id ─────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    await pool.query(`UPDATE subscribers SET status = 'inactive' WHERE id = $1`, [req.params.id]);
    await writeAudit({ tableName: 'subscribers', recordId: req.params.id, action: 'DELETE', actorId: req.user!.sub });
    res.json({ success: true, data: null });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to deactivate subscriber' });
  }
});

export default router;
