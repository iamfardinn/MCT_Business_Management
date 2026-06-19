import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import pool from '../db';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { writeAudit } from '../middleware/audit';
import crypto from 'crypto';

const router = Router();

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: errors.array()[0].msg });
      return;
    }

    const { username, password } = req.body;

    try {
      const { rows } = await pool.query(
        'SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = $1',
        [username]
      );

      const user = rows[0];
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
        return;
      }

      if (!user.is_active) {
        res.status(403).json({ success: false, error: 'Account is deactivated' });
        return;
      }

      const accessToken = jwt.sign(
        { sub: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
      );

      const refreshToken = jwt.sign(
        { sub: user.id },
        process.env.JWT_REFRESH_SECRET!,
        { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
      );

      // Store hashed refresh token
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );

      await writeAudit({
        tableName: 'users',
        recordId: user.id,
        action: 'INSERT',
        actorId: user.id,
        newValues: { event: 'login' },
        ipAddress: req.ip,
      });

      res.json({
        success: true,
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
          user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
          },
        },
      });
    } catch (err) {
      console.error('[Auth/login]', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).json({ success: false, error: 'Refresh token required' });
    return;
  }

  try {
    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as { sub: string };
    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');

    const { rows } = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked = FALSE AND expires_at > NOW()',
      [tokenHash]
    );

    if (!rows[0]) {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      return;
    }

    const { rows: userRows } = await pool.query(
      'SELECT id, username, role FROM users WHERE id = $1 AND is_active = TRUE',
      [payload.sub]
    );

    const user = userRows[0];
    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    const newAccessToken = jwt.sign(
      { sub: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
    );

    res.json({ success: true, data: { access_token: newAccessToken } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { refresh_token } = req.body;
  if (refresh_token) {
    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [tokenHash]);
  }
  res.json({ success: true, data: null, message: 'Logged out successfully' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, full_name, role, is_active, created_at FROM users WHERE id = $1',
      [req.user!.sub]
    );
    if (!rows[0]) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
