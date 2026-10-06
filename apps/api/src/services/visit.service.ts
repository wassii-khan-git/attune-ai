import {
  soapNoteSchema,
  transcriptSchema,
  type ListVisitsResponse,
  type SoapNote,
  type VisitDetail,
  type VisitSummary,
} from '@attune/shared';

import { AppError } from '../lib/app-error.js';
import type { FieldCipher } from '../lib/field-cipher.js';
import { decodePageCursor, encodePageCursor } from '../lib/page-cursor.js';
import type {
  VisitRecord,
  VisitRepository,
  VisitSummaryRecord,
} from '../repositories/visit.repository.js';
import type { AuditService } from './audit.service.js';

export type VisitService = {
  create: (
    userId: string,
    input: { title: string; consentGiven: boolean },
  ) => Promise<VisitSummary>;
  list: (
    userId: string,
    query: { q?: string | undefined; cursor?: string | undefined; limit: number },
  ) => Promise<ListVisitsResponse>;
  /** The only read that decrypts clinical content, and the only one that is audited as a view. */
  get: (userId: string, visitId: string) => Promise<VisitDetail>;
  updateNote: (userId: string, visitId: string, note: SoapNote) => Promise<VisitSummary>;
  /** Idempotent: deleting a visit that is already gone, or was never the caller's, changes nothing. */
  delete: (userId: string, visitId: string) => Promise<void>;
};

/**
 * A generation run finishes or fails well inside this window. A visit still
 * marked PROCESSING after it belongs to a request that died, and may be
 * edited or processed again.
 */
export const PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;

export function processingStaleBefore(now: Date): Date {
  return new Date(now.getTime() - PROCESSING_STALE_AFTER_MS);
}

export type VisitServiceDependencies = {
  visits: VisitRepository;
  cipher: FieldCipher;
  audit: AuditService;
  now: () => Date;
};

/**
 * The encryption context of a field. It ties each ciphertext to one column of
 * one visit, so a value copied to another visit or column will not decrypt.
 */
export function visitFieldContext(visitId: string, field: 'transcript' | 'note'): string {
  return `visit:${visitId}:${field}`;
}

function toSummary(record: VisitSummaryRecord): VisitSummary {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    consentAt: record.consentAt?.toISOString() ?? null,
    durationSec: record.durationSec,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function notFound(): AppError {
  // Also the answer for a visit that belongs to someone else: its existence is not confirmed.
  return new AppError(404, 'NOT_FOUND', 'Visit not found.');
}

export function createVisitService({
  visits,
  cipher,
  audit,
  now,
}: VisitServiceDependencies): VisitService {
  function decryptDetail(record: VisitRecord): VisitDetail {
    return {
      ...toSummary(record),
      transcript:
        record.transcriptEnc === null
          ? null
          : transcriptSchema.parse(
              JSON.parse(
                cipher.decrypt(record.transcriptEnc, visitFieldContext(record.id, 'transcript')),
              ),
            ),
      note:
        record.noteEnc === null
          ? null
          : soapNoteSchema.parse(
              JSON.parse(cipher.decrypt(record.noteEnc, visitFieldContext(record.id, 'note'))),
            ),
    };
  }

  return {
    create: async (userId, { title, consentGiven }) => {
      // The server's clock, not the client's, says when consent was given.
      const record = await visits.create({ userId, title, consentAt: consentGiven ? now() : null });
      await audit.record({
        actorId: userId,
        action: 'VISIT_CREATED',
        resourceType: 'VISIT',
        resourceId: record.id,
      });
      return toSummary(record);
    },

    list: async (userId, { q, cursor, limit }) => {
      // One extra row tells us whether another page exists without a second query.
      const records = await visits.list({
        userId,
        take: limit + 1,
        ...(q === undefined || q === '' ? {} : { titleContains: q }),
        ...(cursor === undefined ? {} : { after: decodePageCursor(cursor) }),
      });

      const page = records.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toSummary),
        nextCursor: records.length > limit && last !== undefined ? encodePageCursor(last) : null,
      };
    },

    get: async (userId, visitId) => {
      const record = await visits.findOwned(visitId, userId);
      if (record === null) {
        throw notFound();
      }

      const detail = decryptDetail(record);
      await audit.record({
        actorId: userId,
        action: 'VISIT_VIEWED',
        resourceType: 'VISIT',
        resourceId: record.id,
      });
      return detail;
    },

    updateNote: async (userId, visitId, note) => {
      const existing = await visits.findOwned(visitId, userId);
      if (existing === null) {
        throw notFound();
      }

      const updated = await visits.updateNoteUnlessProcessing(
        visitId,
        userId,
        cipher.encrypt(JSON.stringify(note), visitFieldContext(visitId, 'note')),
        processingStaleBefore(now()),
      );
      if (updated === null) {
        // The generated note is about to be written; saving now would be overwritten silently.
        throw new AppError(
          409,
          'CONFLICT',
          'This visit is being processed. Try again when it has finished.',
        );
      }

      await audit.record({
        actorId: userId,
        action: 'VISIT_NOTE_UPDATED',
        resourceType: 'VISIT',
        resourceId: visitId,
      });
      return toSummary(updated);
    },

    delete: async (userId, visitId) => {
      if (await visits.deleteOwned(visitId, userId)) {
        await audit.record({
          actorId: userId,
          action: 'VISIT_DELETED',
          resourceType: 'VISIT',
          resourceId: visitId,
        });
      }
    },
  };
}
