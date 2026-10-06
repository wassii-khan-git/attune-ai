import type { AuditAction, AuditResourceType } from '../generated/prisma/enums.js';
import type { PrismaClient } from './prisma.js';

export type { AuditAction, AuditResourceType };

/** Identifiers and enums only. There is nowhere in this shape to put free text. */
export type NewAuditEvent = {
  /** The acting user, or null when the system acted (for example the retention job). */
  actorId: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
};

export type AuditRepository = {
  insert: (event: NewAuditEvent) => Promise<void>;
};

export function createAuditRepository(prisma: PrismaClient): AuditRepository {
  return {
    insert: async ({ actorId, action, resourceType, resourceId }) => {
      await prisma.auditEvent.create({
        data: { userId: actorId, action, resourceType, resourceId },
      });
    },
  };
}
