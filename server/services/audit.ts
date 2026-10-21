import { desc, eq, and, type SQL } from 'drizzle-orm';
import { getDb } from '../lib/db';
import { auditLogs, adminUsers } from '../../db/schema';
import { redact } from '../lib/logger';

/** Registra toda ação administrativa que altera dados. */
export async function recordAudit(entry: {
  adminUserId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLogs).values({
    adminUserId: entry.adminUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: entry.before ? (redact(entry.before) as object) : null,
    after: entry.after ? (redact(entry.after) as object) : null,
    ipAddress: entry.ipAddress ?? null,
  });
}

export async function listAuditLogs(filters: { entity?: string; page: number; pageSize: number }) {
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.entity) conditions.push(eq(auditLogs.entity, filters.entity));
  const where = conditions.length ? and(...conditions) : undefined;

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      createdAt: auditLogs.createdAt,
      adminName: adminUsers.name,
    })
    .from(auditLogs)
    .leftJoin(adminUsers, eq(auditLogs.adminUserId, adminUsers.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
}
