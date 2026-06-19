import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate, requireRole('admin'));

// Helper to generate CRUD routes for simple settings tables
const setupSettingsRoute = (table: string, allowedFields: string[]) => {
  const subRouter = Router();

  subRouter.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id ASC`);
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: `Failed to fetch ${table}` });
    }
  });

  subRouter.post('/', async (req: Request, res: Response): Promise<void> => {
    const keys = Object.keys(req.body).filter(k => allowedFields.includes(k));
    if (keys.length === 0) {
      res.status(400).json({ success: false, error: 'No valid fields provided' });
      return;
    }

    const values = keys.map(k => req.body[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    try {
      const { rows } = await pool.query(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error(`[${table}/POST]`, err);
      res.status(500).json({ success: false, error: `Failed to create entry in ${table}` });
    }
  });

  subRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
    const keys = Object.keys(req.body).filter(k => allowedFields.includes(k));
    if (keys.length === 0) {
      res.status(400).json({ success: false, error: 'No valid fields provided' });
      return;
    }

    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => req.body[k]);

    try {
      const { rows } = await pool.query(
        `UPDATE ${table} SET ${setClause} WHERE id = $1 RETURNING *`,
        [req.params.id, ...values]
      );
      if (rows.length === 0) {
        res.status(404).json({ success: false, error: 'Not found' });
        return;
      }
      res.json({ success: true, data: rows[0] });
    } catch (err) {
      console.error(`[${table}/PATCH]`, err);
      res.status(500).json({ success: false, error: `Failed to update entry in ${table}` });
    }
  });

  subRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (rowCount === 0) {
        res.status(404).json({ success: false, error: 'Not found' });
        return;
      }
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
      console.error(`[${table}/DELETE]`, err);
      res.status(500).json({ success: false, error: `Failed to delete entry in ${table}. It might be referenced elsewhere.` });
    }
  });

  return subRouter;
};

// Map each legacy config table to its sub-router
router.use('/categories', setupSettingsRoute('categories', ['name', 'type']));
router.use('/user_groups', setupSettingsRoute('user_groups', ['name', 'category_id', 'type']));
router.use('/sub_groups', setupSettingsRoute('sub_groups', ['name', 'group_id', 'type', 'reference']));
router.use('/locations', setupSettingsRoute('locations', ['name', 'group_name']));
router.use('/broadband_packages', setupSettingsRoute('broadband_packages', ['package_to', 'name', 'monthly_fee']));
router.use('/reference_lists', setupSettingsRoute('reference_lists', ['reference_by', 'group_name', 'type']));

export default router;
