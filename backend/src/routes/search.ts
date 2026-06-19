import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    res.json({ success: true, data: { invoices: [], contacts: [], products: [], employees: [] } });
    return;
  }

  const query = `%${q}%`;

  try {
    // Search Invoices
    const invRes = await pool.query(
      `SELECT id, invoice_number as title, category as subtitle, 'invoice' as type 
       FROM invoices 
       WHERE invoice_number ILIKE $1 
       ORDER BY created_at DESC LIMIT 5`,
      [query]
    );

    // Search Contacts
    const conRes = await pool.query(
      `SELECT id, name as title, phone as subtitle, 'contact' as type 
       FROM contacts 
       WHERE name ILIKE $1 OR phone ILIKE $1 
       ORDER BY name ASC LIMIT 5`,
      [query]
    );

    // Search Products
    const prodRes = await pool.query(
      `SELECT id, name as title, group_name as subtitle, 'product' as type 
       FROM products 
       WHERE name ILIKE $1 OR group_name ILIKE $1 
       ORDER BY name ASC LIMIT 5`,
      [query]
    );

    // Search Employees (if admin)
    let empRes: any = { rows: [] };
    if (req.user?.role === 'admin') {
      empRes = await pool.query(
        `SELECT id, first_name || ' ' || last_name as title, department as subtitle, 'employee' as type 
         FROM employees 
         WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR employee_id ILIKE $1 
         ORDER BY first_name ASC LIMIT 5`,
        [query]
      );
    }

    res.json({
      success: true,
      data: {
        invoices: invRes.rows,
        contacts: conRes.rows,
        products: prodRes.rows,
        employees: empRes.rows,
      }
    });
  } catch (err) {
    console.error('[GlobalSearch/GET]', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

export default router;
