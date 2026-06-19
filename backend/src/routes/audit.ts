import { Router, Request, Response } from 'express';
import pool from '../db';
import { requireRole } from '../middleware/auth';

const router = Router();

// ─── GET /api/audit ─────────────────────────────────────────────────────────────
router.get('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { page = '1', limit = '50', table_name, action, user_id } = req.query;

  const conditions = [];
  const params: any[] = [];
  let p = 1;

  if (table_name) { conditions.push(`a.table_name = $${p++}`); params.push(table_name); }
  if (action) { conditions.push(`a.action = $${p++}`); params.push(action); }
  if (user_id) { conditions.push(`a.actor_id = $${p++}`); params.push(user_id); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = parseInt(limit as string, 10);
  const offset = (parseInt(page as string, 10) - 1) * limitNum;

  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM audit_log a ${where}`, params);
    const total = parseInt(countRes.rows[0].count, 10);

    const { rows } = await pool.query(
      `SELECT a.*, u.name as actor_name, u.email as actor_email 
       FROM audit_log a
       LEFT JOIN users u ON a.actor_id = u.id
       ${where} 
       ORDER BY a.created_at DESC 
       LIMIT $${p++} OFFSET $${p++}`,
      [...params, limitNum, offset]
    );

    res.json({ success: true, data: rows, total, page: parseInt(page as string, 10), limit: limitNum });
  } catch (err) {
    console.error('[AuditLogs/GET]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
});

export default router;
