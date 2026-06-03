import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, query, validationResult } from 'express-validator';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate);

// ─── GET /api/users ───────────────────────────────────────────────────────────
router.get('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, is_active, created_at FROM users ORDER BY full_name'
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// ─── POST /api/users ──────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole('admin'),
  [
    body('username').trim().isLength({ min: 3, max: 50 }),
    body('password').isLength({ min: 8 }),
    body('full_name').trim().notEmpty(),
    body('role').isIn(['admin', 'employee']),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: errors.array()[0].msg });
      return;
    }

    const { username, password, full_name, role } = req.body;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const { rows } = await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, username, full_name, role, is_active, created_at`,
        [username, passwordHash, full_name, role]
      );
      await writeAudit({ tableName: 'users', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === '23505') {
        res.status(409).json({ success: false, error: 'Username already exists' });
        return;
      }
      res.status(500).json({ success: false, error: 'Failed to create user' });
    }
  }
);

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────
router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { full_name, role, is_active, password } = req.body;

  try {
    const { rows: existing } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!existing[0]) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    let passwordHash = existing[0].password_hash;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    const { rows } = await pool.query(
      `UPDATE users SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active),
        password_hash = $4
       WHERE id = $5
       RETURNING id, username, full_name, role, is_active, updated_at`,
      [full_name, role, is_active, passwordHash, id]
    );

    await writeAudit({ tableName: 'users', recordId: id, action: 'UPDATE', actorId: req.user!.sub, oldValues: existing[0], newValues: rows[0] });
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to update user' });
  }
});

// ─── DELETE /api/users/:id ────────────────────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (id === req.user!.sub) {
    res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    return;
  }
  try {
    await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
    await writeAudit({ tableName: 'users', recordId: id, action: 'DELETE', actorId: req.user!.sub });
    res.json({ success: true, data: null, message: 'User deactivated' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to deactivate user' });
  }
});

export default router;
