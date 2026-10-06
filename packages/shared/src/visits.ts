import { z } from 'zod';

const SECTION_MAX_LENGTH = 10_000;

/** What a section holds when the conversation did not cover it. Findings are never invented. */
export const NOT_DISCUSSED = 'Not discussed';

const soapSection = z.string().trim().max(SECTION_MAX_LENGTH);

/** A SOAP note: the single shape used for model output, storage and editing. */
export const soapNoteSchema = z.object({
  subjective: soapSection,
  objective: soapSection,
  assessment: soapSection,
  plan: soapSection,
});
export type SoapNote = z.infer<typeof soapNoteSchema>;

export const speakerSchema = z.enum(['Clinician', 'Patient', 'Other']);
export type Speaker = z.infer<typeof speakerSchema>;

/** One uninterrupted stretch of speech by one speaker. */
export const transcriptTurnSchema = z.object({
  speaker: speakerSchema,
  text: z.string(),
});
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

export const transcriptSchema = z.array(transcriptTurnSchema);
export type Transcript = z.infer<typeof transcriptSchema>;

export const visitStatusSchema = z.enum(['DRAFT', 'PROCESSING', 'READY', 'FAILED']);
export type VisitStatus = z.infer<typeof visitStatusSchema>;

export const visitTitleSchema = z.string().trim().min(1).max(200);

export const visitIdParamsSchema = z.object({
  id: z.uuid(),
});

export const createVisitRequestSchema = z.object({
  title: visitTitleSchema,
  /** True when the user confirmed consent to record. The server records the time itself. */
  consentGiven: z.boolean().default(false),
});
export type CreateVisitRequest = z.input<typeof createVisitRequestSchema>;

export const updateNoteRequestSchema = z.object({
  note: soapNoteSchema,
});
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;

export const LIST_VISITS_DEFAULT_LIMIT = 20;
export const LIST_VISITS_MAX_LIMIT = 50;

export const listVisitsQuerySchema = z.object({
  /** Case-insensitive match anywhere in the title. */
  q: z.string().trim().max(200).optional(),
  /** `nextCursor` from the previous page. */
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(LIST_VISITS_MAX_LIMIT)
    .default(LIST_VISITS_DEFAULT_LIMIT),
});
export type ListVisitsQuery = z.input<typeof listVisitsQuerySchema>;

/** A visit without its clinical content. Lists use this, so nothing is decrypted to render one. */
export const visitSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: visitStatusSchema,
  consentAt: z.iso.datetime().nullable(),
  durationSec: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type VisitSummary = z.infer<typeof visitSummarySchema>;

export const visitDetailSchema = visitSummarySchema.extend({
  transcript: transcriptSchema.nullable(),
  note: soapNoteSchema.nullable(),
});
export type VisitDetail = z.infer<typeof visitDetailSchema>;

export const visitResponseSchema = z.object({ visit: visitSummarySchema });
export type VisitResponse = z.infer<typeof visitResponseSchema>;

export const visitDetailResponseSchema = z.object({ visit: visitDetailSchema });
export type VisitDetailResponse = z.infer<typeof visitDetailResponseSchema>;

export const listVisitsResponseSchema = z.object({
  items: z.array(visitSummarySchema),
  /** Pass as `cursor` to get the next page. Null on the last page. */
  nextCursor: z.string().nullable(),
});
export type ListVisitsResponse = z.infer<typeof listVisitsResponseSchema>;
