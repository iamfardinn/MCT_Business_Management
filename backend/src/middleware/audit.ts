import { Request, Response, NextFunction } from 'express';
import pool from '../db';
import { AuditAction } from '@mct/shared';

/**
 * Middleware factory that logs every modifying action to the audit_log table.
 * Usage: router.post('/path', authenticate, auditLog('invoices', 'INSERT'), handler)
 */
export function auditLog(tableName: string, action: AuditAction) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Store audit params on the request for handlers to optionally enrich
    (req as Request & { _audit: { tableName: string; action: AuditAction } })._audit = {
      tableName,
      action,
    };
    next();
  };
}

/**
 * Call this from within a route handler after a DB mutation to write the audit entry.
 */
export async function writeAudit(params: {
  tableName: string;
  recordId: string;
  action: AuditAction;
  actorId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (table_name, record_id, action, actor_id, old_values, new_values, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet)`,
      [
        params.tableName,
        params.recordId,
        params.action,
        params.actorId,
        params.oldValues ? JSON.stringify(params.oldValues) : null,
        params.newValues ? JSON.stringify(params.newValues) : null,
        params.ipAddress || null,
      ]
    );
  } catch (err) {
    // Audit failures should not break the main flow — log and continue
    console.error('[Audit] Failed to write audit log:', (err as Error).message);
  }
}
