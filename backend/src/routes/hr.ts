import { Router, Request, Response } from 'express';
import pool from '../db';
import { authenticate, requireRole } from '../middleware/auth';
import { writeAudit } from '../middleware/audit';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ─── EMPLOYEES ───────────────────────────────────────────────────────────────

router.get('/employees', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT * FROM employees ORDER BY first_name ASC, last_name ASC');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[HR/GET_EMPLOYEES]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch employees' });
  }
});

router.post('/employees', async (req: Request, res: Response): Promise<void> => {
  const { employee_id, first_name, last_name, email, phone, department, designation, join_date, base_salary, status } = req.body;
  if (!employee_id || !first_name || !last_name || !join_date) {
    res.status(400).json({ success: false, error: 'Missing required employee fields' });
    return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO employees (employee_id, first_name, last_name, email, phone, department, designation, join_date, base_salary, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [employee_id, first_name, last_name, email, phone, department, designation, join_date, base_salary || 0, status || 'Active']
    );
    await writeAudit({ tableName: 'employees', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err: any) {
    console.error('[HR/POST_EMPLOYEES]', err);
    if (err.code === '23505') res.status(409).json({ success: false, error: 'Employee ID already exists' });
    else res.status(500).json({ success: false, error: 'Failed to create employee' });
  }
});

router.patch('/employees/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const updates = req.body;
  const allowed = ['first_name', 'last_name', 'email', 'phone', 'department', 'designation', 'base_salary', 'status'];
  const keys = Object.keys(updates).filter(k => allowed.includes(k));
  if (!keys.length) { res.status(400).json({ success: false, error: 'No valid fields' }); return; }

  try {
    const oldRes = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (!oldRes.rows.length) { res.status(404).json({ success: false, error: 'Employee not found' }); return; }

    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => updates[k]);
    const { rows } = await pool.query(`UPDATE employees SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, ...values]);

    await writeAudit({ tableName: 'employees', recordId: id, action: 'UPDATE', actorId: req.user!.sub, oldValues: oldRes.rows[0], newValues: rows[0] });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[HR/PATCH_EMPLOYEES]', err);
    res.status(500).json({ success: false, error: 'Failed to update employee' });
  }
});

// ─── PAYROLL ─────────────────────────────────────────────────────────────────

router.get('/payroll', async (req: Request, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, e.first_name, e.last_name, e.employee_id as emp_code 
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      ORDER BY p.salary_month DESC, e.first_name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[HR/GET_PAYROLL]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payroll records' });
  }
});

router.post('/payroll', async (req: Request, res: Response): Promise<void> => {
  const { employee_id, salary_month, base_salary, allowances, deductions } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO payroll (employee_id, salary_month, base_salary, allowances, deductions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [employee_id, salary_month, base_salary || 0, allowances || 0, deductions || 0, req.user!.sub]
    );
    await writeAudit({ tableName: 'payroll', recordId: rows[0].id, action: 'INSERT', actorId: req.user!.sub, newValues: rows[0] });
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err: any) {
    console.error('[HR/POST_PAYROLL]', err);
    if (err.code === '23505') res.status(409).json({ success: false, error: 'Payroll already exists for this month' });
    else res.status(500).json({ success: false, error: 'Failed to create payroll' });
  }
});

router.patch('/payroll/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const oldRes = await pool.query('SELECT * FROM payroll WHERE id = $1', [id]);
    if (!oldRes.rows.length) { res.status(404).json({ success: false, error: 'Payroll not found' }); return; }
    if (oldRes.rows[0].status !== 'Draft') { res.status(400).json({ success: false, error: 'Can only approve Draft payrolls' }); return; }

    const { rows } = await pool.query(`UPDATE payroll SET status = 'Approved' WHERE id = $1 RETURNING *`, [id]);
    await writeAudit({ tableName: 'payroll', recordId: id, action: 'APPROVE', actorId: req.user!.sub, oldValues: oldRes.rows[0], newValues: rows[0] });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[HR/APPROVE_PAYROLL]', err);
    res.status(500).json({ success: false, error: 'Failed to approve payroll' });
  }
});

export default router;
