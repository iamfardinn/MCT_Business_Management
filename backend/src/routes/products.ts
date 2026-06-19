import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ─── GET /api/products ───────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { search, category, group_name } = req.query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (search) {
    conditions.push(`(p.name ILIKE $${p} OR p.group_name ILIKE $${p})`);
    params.push(`%${search}%`);
    p++;
  }
  if (category) {
    conditions.push(`p.category = $${p++}`);
    params.push(category);
  }
  if (group_name) {
    conditions.push(`p.group_name = $${p++}`);
    params.push(group_name);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT p.*, COALESCE(s.current_stock, 0) as current_stock 
       FROM products p
       LEFT JOIN product_stock s ON p.id = s.product_id AND s.warehouse_id = '00000000-0000-0000-0000-000000000001'
       ${where} 
       ORDER BY p.group_name ASC, p.name ASC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[Products/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// ─── GET /api/products/:id ───────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Products/GET:id]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch product' });
  }
});

// ─── POST /api/products ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    group_name, name, unit, sales_rate, s_unit, p_unit,
    purchase_rate, offer, offer_rate, offer_sales, category
  } = req.body;

  if (!name) {
    res.status(400).json({ success: false, error: 'Product name is required' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO products (
         group_name, name, unit, sales_rate, s_unit, p_unit,
         purchase_rate, offer, offer_rate, offer_sales, category
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        group_name, name, unit, sales_rate || 0, s_unit || 0, p_unit || 0,
        purchase_rate || 0, offer || 0, offer_rate || 0, offer_sales || 0, category
      ]
    );

    // Skip audit for setup simplicity, or uncomment if desired
    // await writeAudit(pool, 'products', rows[0].id, 'INSERT', req.user!.sub, null, rows[0]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Products/POST]', err);
    res.status(500).json({ success: false, error: 'Failed to create product' });
  }
});

// ─── PATCH /api/products/:id ─────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const updates = req.body;
  const allowedKeys = [
    'group_name', 'name', 'unit', 'sales_rate', 's_unit', 'p_unit',
    'purchase_rate', 'offer', 'offer_rate', 'offer_sales', 'category'
  ];

  const keys = Object.keys(updates).filter((k) => allowedKeys.includes(k));
  if (keys.length === 0) {
    res.status(400).json({ success: false, error: 'No valid fields provided for update' });
    return;
  }

  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => updates[k]);

  try {
    const oldRes = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (oldRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE products SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    await writeAudit({
      tableName: 'products',
      recordId: req.params.id,
      action: 'UPDATE',
      actorId: req.user!.sub,
      oldValues: oldRes.rows[0],
      newValues: rows[0],
    });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[Products/PATCH]', err);
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

// ─── DELETE /api/products/:id ────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const oldRes = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (oldRes.rowCount === 0) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }

    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);

    await writeAudit({
      tableName: 'products',
      recordId: req.params.id,
      action: 'DELETE',
      actorId: req.user!.sub,
      oldValues: oldRes.rows[0],
      newValues: null,
    });

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('[Products/DELETE]', err);
    res.status(500).json({ success: false, error: 'Failed to delete product' });
  }
});

export default router;
