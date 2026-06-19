import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool, { withTransaction } from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';
import { emitNewSubmission, emitApproved, emitRejected } from '../socket';

const router = Router();
router.use(authenticate);

// ─── GET /api/invoices ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { status, category, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  // Employees only see their own submissions
  if (req.user!.role === 'employee') {
    conditions.push(`i.submitted_by = $${p++}`);
    params.push(req.user!.sub);
  }

  if (status) { conditions.push(`i.status = $${p++}`); params.push(status); }
  if (category) { conditions.push(`i.category = $${p++}`); params.push(category); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT i.*, u.full_name AS submitted_by_name,
              a.full_name AS approved_by_name,
              c.name AS contact_name, s.name AS subscriber_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.submitted_by
       LEFT JOIN users a ON a.id = i.approved_by
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN subscribers s ON s.id = i.subscriber_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, parseInt(limit as string), offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM invoices i ${where}`,
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
    console.error('[Invoices/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
  }
});

// ─── GET /api/invoices/:id ────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, u.full_name AS submitted_by_name
       FROM invoices i
       LEFT JOIN users u ON u.id = i.submitted_by
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }

    if (req.user!.role === 'employee' && rows[0].submitted_by !== req.user!.sub) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    const { rows: items } = await pool.query(
      'SELECT * FROM invoice_items WHERE invoice_id = $1',
      [req.params.id]
    );

    res.json({ success: true, data: { ...rows[0], items } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch invoice' });
  }
});

// ─── POST /api/invoices ───────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('category').isIn(['matador', 'olympic', 'bombay', 'mtb_broadband']),
    body('items').isArray({ min: 1 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: errors.array()[0].msg });
      return;
    }

    const {
      category, contact_id, subscriber_id, notes, items,
      market_cost, carrying_cost, commission, free_value, damage_value,
      market_short, deposit_cash, due_collections, collections_date,
      total_sales, invoice_total
    } = req.body;

    try {
      const invoice = await withTransaction(async (client) => {
        // Generate invoice number
        const { rows: seqRows } = await client.query("SELECT nextval('invoice_number_seq') AS seq");
        const invoiceNumber = `MCT-${new Date().getFullYear()}-${String(seqRows[0].seq).padStart(5, '0')}`;

          const { rows: invRows } = await client.query(
            `INSERT INTO invoices (
               invoice_number, category, contact_id, subscriber_id, notes, submitted_by,
               market_cost, carrying_cost, commission, free_value, damage_value,
               market_short, deposit_cash, due_collections, collections_date,
               total_sales, invoice_total
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
             RETURNING *`,
            [
              invoiceNumber, category, contact_id || null, subscriber_id || null, notes, req.user!.sub,
              market_cost || 0, carrying_cost || 0, commission || 0, free_value || 0, damage_value || 0,
              market_short || 0, deposit_cash || 0, due_collections || 0, collections_date || null,
              total_sales || 0, invoice_total || 0
            ]
          );

        const inv = invRows[0];

        // Insert items
        for (const item of items) {
          await client.query(
            `INSERT INTO invoice_items
              (invoice_id, product_name, product_id, quantity, rate, line_total, damage_a, damage_b, free_items, commission,
               month_name, subscriber_address, running_bill, item_subscriber_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              inv.id,
              item.product_name || null,
              item.product_id || null,
              item.quantity || 0,
              item.rate || 0,
              item.line_total || 0,
              item.damage_a || null,
              item.damage_b || null,
              item.free_items || null,
              item.commission || null,
              item.month_name || null,
              item.subscriber_address || null,
              item.running_bill || null,
              item.subscriber_id || null,
            ]
          );
        }
        return inv;
      });

      await writeAudit({ tableName: 'invoices', recordId: invoice.id, action: 'INSERT', actorId: req.user!.sub, newValues: invoice });

      // Real-time notification to admin
      emitNewSubmission('invoice', invoice);

      res.status(201).json({ success: true, data: invoice, message: 'Invoice submitted for approval' });
    } catch (err) {
      console.error('[Invoices/POST]', err);
      res.status(500).json({ success: false, error: 'Failed to create invoice' });
    }
  }
);

// ─── PATCH /api/invoices/:id/approve ─────────────────────────────────────────
router.patch(
  '/:id/approve',
  requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
      const { rows: existing } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (!existing[0]) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }
      if (existing[0].status !== 'pending') {
        res.status(400).json({ success: false, error: 'Invoice is not in pending state' }); return;
      }

      const { rows } = await pool.query(
        `UPDATE invoices SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 RETURNING *`,
        [req.user!.sub, id]
      );

      // Deduct from inventory for product items
      const { rows: items } = await pool.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = $1 AND product_id IS NOT NULL', [id]);
      for (const item of items) {
        if (item.quantity > 0) {
          await pool.query(
            `INSERT INTO inventory_transactions (product_id, warehouse_id, action, quantity, reference_id, created_by)
             VALUES ($1, '00000000-0000-0000-0000-000000000001', 'sale', $2, $3, $4)`,
            [item.product_id, -item.quantity, id, req.user!.sub]
          );
        }
      }

      await pool.query(
        `INSERT INTO approval_records (record_type, record_id, action, actor_id) VALUES ('invoice', $1, 'approve', $2)`,
        [id, req.user!.sub]
      );

      await writeAudit({ tableName: 'invoices', recordId: id, action: 'APPROVE', actorId: req.user!.sub, oldValues: existing[0], newValues: rows[0] });
      emitApproved(existing[0].submitted_by, 'invoice', id);

      res.json({ success: true, data: rows[0], message: 'Invoice approved' });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to approve invoice' });
    }
  }
);

// ─── PATCH /api/invoices/:id/reject ──────────────────────────────────────────
router.patch(
  '/:id/reject',
  requireRole('admin'),
  [body('reason').trim().notEmpty().withMessage('Rejection reason is required')],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: errors.array()[0].msg }); return;
    }

    const { id } = req.params;
    const { reason } = req.body;

    try {
      const { rows: existing } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
      if (!existing[0]) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }

      const { rows } = await pool.query(
        `UPDATE invoices SET status = 'rejected', rejection_reason = $1 WHERE id = $2 RETURNING *`,
        [reason, id]
      );

      await pool.query(
        `INSERT INTO approval_records (record_type, record_id, action, actor_id, reason) VALUES ('invoice', $1, 'reject', $2, $3)`,
        [id, req.user!.sub, reason]
      );

      await writeAudit({ tableName: 'invoices', recordId: id, action: 'REJECT', actorId: req.user!.sub });
      emitRejected(existing[0].submitted_by, 'invoice', id, reason);

      res.json({ success: true, data: rows[0], message: 'Invoice rejected' });
    } catch {
      res.status(500).json({ success: false, error: 'Failed to reject invoice' });
    }
  }
);

// ─── DELETE /api/invoices/:id ─────────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
    if (!rows[0]) { res.status(404).json({ success: false, error: 'Invoice not found' }); return; }

    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    await writeAudit({ tableName: 'invoices', recordId: req.params.id, action: 'DELETE', actorId: req.user!.sub, oldValues: rows[0] });
    res.json({ success: true, data: null, message: 'Invoice deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete invoice' });
  }
});

export default router;
