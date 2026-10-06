import type { PrismaClient } from './prisma.js';

export type RetentionRepository = {
  /**
   * Deletes guest accounts created before `cutoff` and writes one audit row
   * per account, with no acting user. Returns how many were deleted.
   */
  purgeGuestsCreatedBefore: (cutoff: Date) => Promise<number>;
};

export function createRetentionRepository(prisma: PrismaClient): RetentionRepository {
  return {
    // One statement, so an account cannot be deleted without its audit row
    // being written, and overlapping runs cannot record the same account twice.
    purgeGuestsCreatedBefore: async (cutoff) => {
      const rows = await prisma.$queryRaw<{ resource_id: string }[]>`
        WITH deleted AS (
          DELETE FROM users
          WHERE is_guest AND created_at < ${cutoff}
          RETURNING id
        )
        INSERT INTO audit_events (id, user_id, action, resource_type, resource_id)
        SELECT gen_random_uuid(), NULL, 'ACCOUNT_DELETED'::audit_action, 'USER'::audit_resource_type, id
        FROM deleted
        RETURNING resource_id::text AS resource_id`;
      return rows.length;
    },
  };
}
