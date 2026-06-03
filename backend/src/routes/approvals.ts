import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// ─── GET /api/approvals ───────────────────────────────────────────────────────
// Real-time approval queue: all pending invoices and expenses combined
router.get('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { page = '1', limit = '30' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    const { rows } = await pool.query(`
      SELECT
        'invoice' AS record_type,
        i.id, i.invoice_number AS ref_number, i.category, i.status,
        u.full_name AS submitted_by_name, i.created_at,
        NULL::TEXT AS description, NULL::NUMERIC AS amount
      FROM invoices i
      LEFT JOIN users u ON u.id = i.submitted_by
      WHERE i.status = 'pending'

      UNION ALL

      SELECT
        'expense' AS record_type,
        e.id, e.category::TEXT AS ref_number, NULL AS category, e.status,
        u.full_name AS submitted_by_name, e.created_at,
        e.description, e.amount
      FROM expenses e
      LEFT JOIN users u ON u.id = e.submitted_by
      WHERE e.status = 'pending'

      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [parseInt(limit as string), offset]);

    const { rows: countRows } = await pool.query(`
      SELECT (
        (SELECT COUNT(*) FROM invoices WHERE status = 'pending') +
        (SELECT COUNT(*) FROM expenses WHERE status = 'pending')
      ) AS total
    `);

    res.json({
      success: true,
      data: rows,
      total: parseInt(countRows[0].total),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
  } catch (err) {
    console.error('[Approvals/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch approval queue' });
  }
});

// ─── GET /api/approvals/history ───────────────────────────────────────────────
router.get('/history', requireRole('admin'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT ar.*, u.full_name AS actor_name
      FROM approval_records ar
      LEFT JOIN users u ON u.id = ar.actor_id
      ORDER BY ar.acted_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch approval history' });
  }
});

export default router;
