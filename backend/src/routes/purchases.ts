import { Router, Request, Response } from 'express';
import pool, { withTransaction } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ─── GET /api/purchases ───────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { search, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (search) {
    conditions.push(`(invoice_number ILIKE $${p} OR supplier_name ILIKE $${p})`);
    params.push(`%${search}%`);
    p++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.full_name AS submitted_by_name
       FROM purchase_invoices p
       LEFT JOIN users u ON u.id = p.submitted_by
       ${where}
       ORDER BY p.purchase_date DESC, p.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit as string), offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM purchase_invoices p ${where}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      total: parseInt(countRows[0].count),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error('[Purchases/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch purchases' });
  }
});

// ─── GET /api/purchases/:id ───────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.full_name AS submitted_by_name
       FROM purchase_invoices p
       LEFT JOIN users u ON u.id = p.submitted_by
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ success: false, error: 'Purchase not found' }); return; }

    const { rows: items } = await pool.query(
      'SELECT * FROM purchase_items WHERE purchase_id = $1',
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], items } });
  } catch (err) {
    console.error('[Purchases/GET_ID]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch purchase' });
  }
});

// ─── POST /api/purchases ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    invoice_number, purchase_date, supplier_name, supplier_address,
    amount, discount, commission, carrying_cost, total_amount,
    advance_payment, due_amount, total_due, payment_date, status, notes,
    items
  } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'At least one item is required' });
    return;
  }

  try {
    const purchase = await withTransaction(async (client) => {
      // Create Invoice
      const { rows: invRows } = await client.query(
        `INSERT INTO purchase_invoices (
           invoice_number, purchase_date, supplier_name, supplier_address,
           amount, discount, commission, carrying_cost, total_amount,
           advance_payment, due_amount, total_due, payment_date, status, notes, submitted_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          invoice_number, purchase_date, supplier_name, supplier_address,
          amount || 0, discount || 0, commission || 0, carrying_cost || 0, total_amount || 0,
          advance_payment || 0, due_amount || 0, total_due || 0, payment_date || null,
          status || 'Active', notes, req.user!.sub
        ]
      );
      const inv = invRows[0];

      // Create Items
      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_items (
             purchase_id, product_name, product_id, quantity, unit, rate,
             discount_percent, discount_amount, line_total
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            inv.id, item.product_name, item.product_id || null, item.quantity || 0, item.unit, item.rate || 0,
            item.discount_percent || 0, item.discount_amount || 0, item.line_total || 0
          ]
        );

        if (item.product_id && (item.quantity || 0) > 0) {
          await client.query(
            `INSERT INTO inventory_transactions (product_id, warehouse_id, action, quantity, reference_id, created_by)
             VALUES ($1, '00000000-0000-0000-0000-000000000001', 'purchase', $2, $3, $4)`,
            [item.product_id, item.quantity, inv.id, req.user!.sub]
          );
        }
      }

      return inv;
    });

    await writeAudit({ tableName: 'purchase_invoices', recordId: purchase.id, action: 'INSERT', actorId: req.user!.sub, newValues: purchase });

    res.status(201).json({ success: true, data: purchase });
  } catch (err: any) {
    console.error('[Purchases/POST]', err);
    if (err.code === '23505') {
      res.status(409).json({ success: false, error: 'Invoice number already exists' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to create purchase' });
    }
  }
});

// ─── DELETE /api/purchases/:id ────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rowCount, rows: oldRows } = await pool.query(
      'DELETE FROM purchase_invoices WHERE id = $1 RETURNING *',
      [req.params.id]
    );

    if (rowCount === 0) { res.status(404).json({ success: false, error: 'Purchase not found' }); return; }

    await writeAudit({ tableName: 'purchase_invoices', recordId: req.params.id, action: 'DELETE', actorId: req.user!.sub, oldValues: oldRows[0], newValues: null });

    res.json({ success: true, message: 'Purchase deleted successfully' });
  } catch (err) {
    console.error('[Purchases/DELETE]', err);
    res.status(500).json({ success: false, error: 'Failed to delete purchase' });
  }
});

export default router;
