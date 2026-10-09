import type { Request } from "express";
import { prisma } from "../config/db";

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export function getRequestContext(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.get("user-agent")?.slice(0, 255) };
}

interface AuditEntry {
  shopId: string;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, string | number | boolean | null>;
}

// An audit failure must never break the real action, so errors are only logged.
export async function logAudit(entry: AuditEntry, ctx?: RequestContext): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        shopId: entry.shopId,
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        details: entry.details,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      },
    });
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}
