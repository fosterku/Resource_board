// Audit logging service for tracking all system activities
import { db } from "../db";
import { auditLogs, type InsertAuditLog } from "@shared/schema";

export type AuditAction = 
  // Company actions
  | 'company.create' | 'company.update' | 'company.delete'
  // Session actions
  | 'session.create' | 'session.update' | 'session.close' | 'session.add_contractor' | 'session.remove_contractor'
  // Roster actions
  | 'roster.create' | 'roster.update' | 'roster.delete' | 'roster.submit' | 'roster.approve' | 'roster.reject'
  // Crew actions
  | 'crew.create' | 'crew.update' | 'crew.delete'
  // Timesheet actions
  | 'timesheet.create' | 'timesheet.update' | 'timesheet.submit' | 'timesheet.approve' | 'timesheet.reject'
  // Expense actions
  | 'expense.create' | 'expense.update' | 'expense.delete' | 'expense.submit' | 'expense.approve' | 'expense.reject'
  // Invoice actions
  | 'invoice.create' | 'invoice.update' | 'invoice.send' | 'invoice.pay' | 'invoice.void'
  // User actions
  | 'user.login' | 'user.logout' | 'user.update_role' | 'user.assign_company'
  // Auth actions
  | 'auth.login' | 'auth.logout' | 'auth.failed_login';

export interface AuditContext {
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  context: AuditContext;
}): Promise<void> {
  try {
    const auditEntry: InsertAuditLog = {
      userId: params.context.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      changes: params.details ? JSON.stringify(params.details) : null,
      ipAddress: params.context.ipAddress || null,
      userAgent: params.context.userAgent || null,
    };

    await db.insert(auditLogs).values(auditEntry);
  } catch (error) {
    // Log audit errors but don't throw - audit failures shouldn't break operations
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Get audit context from Express request
 */
export function getAuditContext(req: any): AuditContext {
  return {
    userId: req.authenticatedUser?.id,
    userEmail: req.authenticatedUser?.email || undefined,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * Audit decorator for tracking changes
 */
export function auditAction(
  action: AuditAction,
  entityType: string,
  getEntityId?: (result: any) => string
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      const req = args.find((arg: any) => arg?.authenticatedUser);
      if (req) {
        const entityId = getEntityId ? getEntityId(result) : undefined;
        await createAuditLog({
          action,
          entityType,
          entityId,
          context: getAuditContext(req),
        });
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Log authentication events
 */
export async function logAuthEvent(params: {
  action: 'auth.login' | 'auth.logout' | 'auth.failed_login';
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}): Promise<void> {
  await createAuditLog({
    action: params.action,
    entityType: 'auth',
    details: params.details,
    context: {
      userId: params.userId,
      userEmail: params.userEmail,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });
}

/**
 * Query audit logs with filters
 */
export async function getAuditLogs(filters?: {
  userId?: string;
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  // TODO: Implement when needed
  // This would use Drizzle queries to filter audit logs
  return [];
}
