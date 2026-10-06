import type { PrismaClient } from './prisma.js';

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type RefreshTokenRepository = {
  create: (input: { userId: string; tokenHash: string; expiresAt: Date }) => Promise<void>;
  findByHash: (tokenHash: string) => Promise<RefreshTokenRecord | null>;
  /**
   * Revokes the token only if it is still active, in one statement. Returns
   * false when it was already revoked, which means it was used twice.
   */
  revokeIfActive: (id: string, now: Date) => Promise<boolean>;
  revokeAllForUser: (userId: string, now: Date) => Promise<void>;
  /** Removes tokens that expired before `cutoff`. Returns how many were removed. */
  deleteExpiredBefore: (cutoff: Date) => Promise<number>;
};

export function createRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    create: async (data) => {
      await prisma.refreshToken.create({ data });
    },

    findByHash: (tokenHash) =>
      prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, revokedAt: true },
      }),

    revokeIfActive: async (id, now) => {
      const { count } = await prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: now },
      });
      return count === 1;
    },

    revokeAllForUser: async (userId, now) => {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
    },

    deleteExpiredBefore: async (cutoff) => {
      const { count } = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: cutoff } },
      });
      return count;
    },
  };
}
