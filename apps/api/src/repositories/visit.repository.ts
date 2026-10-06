import type { Prisma } from '../generated/prisma/client.js';
import type { VisitStatus } from '../generated/prisma/enums.js';
import { escapeLikePattern } from './like-pattern.js';
import type { PrismaClient } from './prisma.js';

export type { VisitStatus };

/** A visit without its encrypted fields. Selecting only this keeps ciphertext out of list queries. */
export type VisitSummaryRecord = {
  id: string;
  userId: string;
  title: string;
  status: VisitStatus;
  consentAt: Date | null;
  durationSec: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VisitRecord = VisitSummaryRecord & {
  transcriptEnc: string | null;
  noteEnc: string | null;
};

/** The position after the last row of a page: rows are ordered by creation time, then id. */
export type VisitPagePosition = {
  createdAt: Date;
  id: string;
};

export type ListVisitsInput = {
  userId: string;
  titleContains?: string;
  after?: VisitPagePosition;
  take: number;
};

/**
 * Every method that reads or changes a visit takes the owner's id and puts it
 * in the WHERE clause, so a visit that belongs to someone else is simply not
 * found. Ownership cannot be forgotten by a caller.
 */
export type VisitRepository = {
  create: (input: {
    userId: string;
    title: string;
    consentAt: Date | null;
  }) => Promise<VisitSummaryRecord>;
  /** Newest first. */
  list: (input: ListVisitsInput) => Promise<VisitSummaryRecord[]>;
  findOwned: (id: string, userId: string) => Promise<VisitRecord | null>;
  /**
   * Stores the note unless a generation is in flight. Returns null when nothing
   * was updated. A run that started before `staleBefore` is treated as abandoned.
   */
  updateNoteUnlessProcessing: (
    id: string,
    userId: string,
    noteEnc: string,
    staleBefore: Date,
  ) => Promise<VisitSummaryRecord | null>;
  /**
   * Moves the visit to PROCESSING in one statement and reports whether this
   * caller won. It loses to a run that is still in flight, and takes over one
   * that started before `staleBefore`, which a crashed request would otherwise
   * leave stuck forever.
   */
  claimForProcessing: (id: string, userId: string, staleBefore: Date) => Promise<boolean>;
  /** Stores the results and marks the visit READY. Returns null if the visit no longer exists. */
  completeProcessing: (
    id: string,
    userId: string,
    result: { transcriptEnc: string; noteEnc: string; durationSec: number | null },
  ) => Promise<VisitSummaryRecord | null>;
  setStatus: (id: string, userId: string, status: VisitStatus) => Promise<void>;
  /** Returns whether a row was deleted. */
  deleteOwned: (id: string, userId: string) => Promise<boolean>;
};

const summarySelect = {
  id: true,
  userId: true,
  title: true,
  status: true,
  consentAt: true,
  durationSec: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VisitSelect;

const fullSelect = {
  ...summarySelect,
  transcriptEnc: true,
  noteEnc: true,
} satisfies Prisma.VisitSelect;

/** Matches visits with no run in flight: any other status, or a PROCESSING row untouched since `staleBefore`. */
function notBeingProcessed(staleBefore: Date): Prisma.VisitWhereInput {
  return {
    OR: [{ status: { not: 'PROCESSING' } }, { updatedAt: { lt: staleBefore } }],
  };
}

export function createVisitRepository(prisma: PrismaClient): VisitRepository {
  return {
    create: (data) => prisma.visit.create({ data, select: summarySelect }),

    list: ({ userId, titleContains, after, take }) =>
      prisma.visit.findMany({
        where: {
          userId,
          ...(titleContains === undefined
            ? {}
            : { title: { contains: escapeLikePattern(titleContains), mode: 'insensitive' } }),
          // Keyset pagination: stable while rows are added or deleted, unlike OFFSET.
          ...(after === undefined
            ? {}
            : {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: summarySelect,
      }),

    findOwned: (id, userId) =>
      prisma.visit.findFirst({ where: { id, userId }, select: fullSelect }),

    updateNoteUnlessProcessing: async (id, userId, noteEnc, staleBefore) => {
      const [updated] = await prisma.visit.updateManyAndReturn({
        where: { id, userId, ...notBeingProcessed(staleBefore) },
        data: { noteEnc },
        select: summarySelect,
      });
      return updated ?? null;
    },

    claimForProcessing: async (id, userId, staleBefore) => {
      const { count } = await prisma.visit.updateMany({
        where: { id, userId, ...notBeingProcessed(staleBefore) },
        data: { status: 'PROCESSING' },
      });
      return count === 1;
    },

    completeProcessing: async (id, userId, result) => {
      const [updated] = await prisma.visit.updateManyAndReturn({
        where: { id, userId },
        data: { ...result, status: 'READY' },
        select: summarySelect,
      });
      return updated ?? null;
    },

    setStatus: async (id, userId, status) => {
      await prisma.visit.updateMany({ where: { id, userId }, data: { status } });
    },

    deleteOwned: async (id, userId) => {
      const { count } = await prisma.visit.deleteMany({ where: { id, userId } });
      return count === 1;
    },
  };
}
