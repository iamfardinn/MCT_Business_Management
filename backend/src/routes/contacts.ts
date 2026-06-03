import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

const VALID_TYPES = ['sub_dealer', 'retailer', 'side_market', 'employee'];

// ─── GET /api/contacts ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { type, search, page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  const params: unknown[] = [];
  const conditions: string[] = ['is_active = TRUE'];
  let p = 1;

  if (type) { conditions.push(`type = $${p++}`); params.push(type); }
  if (search) { conditions.push(`name ILIKE $${p++}`); params.push(`%${search}%`); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const { rows } = await pool.query(
      `SELECT * FROM contacts ${where} ORDER BY name LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit as string), offset]
    );
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM contacts ${where}`, params);
    res.json({ success: true, data: rows, total: parseInt(countRows[0].count) });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

// ─── POST /api/contacts ───────────────────────────────────────────────────────
router.post('/',
  [
    body('type').isIn(VALID_TYPES),
    body('name').trim().notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ success: false, error: errors.array()[0].msg }); return; }

    const { type, name, phone, address, area } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO contacts (type, name, phone, address, area, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [type, name, phone, address, area, req.user!.sub]
      );
      await writeAudit({ tableName: 'contacts', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
      res.status(201).json({ success: true, data: rows[0] });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to create contact' });
    }
  }
);

// ─── PATCH /api/contacts/:id ──────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name, phone, address, area, outstanding_balance } = req.body;

  // Only admin can edit outstanding_balance
  if (outstanding_balance !== undefined && req.user!.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Only admin can edit balance' }); return;
  }

  try {
    const { rows: existing } = await pool.query('SELECT * FROM contacts WHERE id = $1', [id]);
    if (!existing[0]) { res.status(404).json({ success: false, error: 'Contact not found' }); return; }

    const { rows } = await pool.query(
      `UPDATE contacts SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         address = COALESCE($3, address),
         area = COALESCE($4, area),
         outstanding_balance = COALESCE($5, outstanding_balance)
       WHERE id = $6 RETURNING *`,
      [name, phone, address, area, outstanding_balance, id]
    );
    await writeAudit({ tableName: 'contacts', recordId: id, action: 'UPDATE', actorId: req.user!.sub, oldValues: existing[0], newValues: rows[0] });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

// ─── DELETE /api/contacts/:id ─────────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    await pool.query('UPDATE contacts SET is_active = FALSE WHERE id = $1', [req.params.id]);
    await writeAudit({ tableName: 'contacts', recordId: req.params.id, action: 'DELETE', actorId: req.user!.sub });
    res.json({ success: true, data: null });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to deactivate contact' });
  }
});

export default router;
