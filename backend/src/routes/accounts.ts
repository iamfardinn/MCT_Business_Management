import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { db } from '../lib/db';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';

const router = Router();

// GET /accounts - List all accounts, optionally hierarchical
router.get('/', requireAuth, async (req, res) => {
  try {
    const { tree } = req.query;
    
    const result = await db.query(
      `SELECT * FROM chart_of_accounts ORDER BY code ASC`
    );

    let accounts = result.rows;

    // Build a tree if requested
    if (tree === 'true') {
      const accountMap = new Map();
      const roots: any[] = [];
      
      accounts.forEach(acc => {
        accountMap.set(acc.id, { ...acc, children: [] });
      });

      accounts.forEach(acc => {
        const node = accountMap.get(acc.id);
        if (acc.parent_id) {
          const parent = accountMap.get(acc.parent_id);
          if (parent) {
            parent.children.push(node);
          } else {
            roots.push(node);
          }
        } else {
          roots.push(node);
        }
      });
      accounts = roots;
    }

    res.json({ data: accounts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /accounts - Create an account
router.post(
  '/',
  requireAuth,
  [
    body('code').isString().notEmpty(),
    body('name').isString().notEmpty(),
    body('type').isIn(['asset', 'liability', 'equity', 'revenue', 'expense']),
    body('parent_id').optional({ nullable: true }).isUUID(),
    body('description').optional({ nullable: true }).isString(),
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const { code, name, type, parent_id, description } = req.body;
      const result = await db.query(
        `INSERT INTO chart_of_accounts (code, name, type, parent_id, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [code, name, type, parent_id, description]
      );
      res.status(201).json({ data: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Account code already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /accounts/:id - Update an account
router.put(
  '/:id',
  requireAuth,
  [
    param('id').isUUID(),
    body('code').isString().notEmpty(),
    body('name').isString().notEmpty(),
    body('type').isIn(['asset', 'liability', 'equity', 'revenue', 'expense']),
    body('parent_id').optional({ nullable: true }).isUUID(),
    body('is_active').isBoolean(),
    body('description').optional({ nullable: true }).isString(),
  ],
  validateRequest,
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { code, name, type, parent_id, is_active, description } = req.body;
      
      const result = await db.query(
        `UPDATE chart_of_accounts
         SET code = $1, name = $2, type = $3, parent_id = $4, is_active = $5, description = $6, updated_at = CURRENT_TIMESTAMP
         WHERE id = $7 RETURNING *`,
        [code, name, type, parent_id, is_active, description, id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json({ data: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Account code already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
