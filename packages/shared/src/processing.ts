import { z } from 'zod';

import { errorCodeSchema } from './errors.js';
import { soapNoteSchema, transcriptSchema, visitDetailSchema } from './visits.js';

/** Vercel rejects request bodies over about 4.5 MB, so uploads stop safely below that. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_RECORDING_SEC = 5 * 60;

/** Form field that carries the recording in `POST /v1/visits/:id/process`. */
export const AUDIO_FIELD_NAME = 'audio';

/** The text fields that may accompany the audio file. */
export const processVisitFieldsSchema = z.object({
  /** Length of the recording as measured by the client. Shown in the UI; not trusted for limits. */
  durationSec: z.coerce.number().int().min(1).max(MAX_RECORDING_SEC).optional(),
});

export const processStageSchema = z.enum(['transcribing', 'drafting']);
export type ProcessStage = z.infer<typeof processStageSchema>;

/**
 * `POST /v1/visits/:id/process` answers with newline-delimited JSON, one of
 * these events per line. A run always ends with exactly one `done` or `error`.
 */
export const processEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage'), stage: processStageSchema }),
  z.object({ type: z.literal('transcript'), transcript: transcriptSchema }),
  /** A snapshot of the note so far. Each one replaces the previous. */
  z.object({ type: z.literal('note'), note: soapNoteSchema.partial() }),
  z.object({ type: z.literal('done'), visit: visitDetailSchema }),
  z.object({
    type: z.literal('error'),
    error: z.object({ code: errorCodeSchema, message: z.string() }),
  }),
]);
export type ProcessEvent = z.infer<typeof processEventSchema>;
