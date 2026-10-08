import * as z from 'zod';

/** Machine-readable error codes. Clients branch on these, never on the message text. */
export const errorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'CONFLICT',
  'NOTE_EXISTS',
  'VISIT_LIMIT_REACHED',
  'CONSENT_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'NO_SPEECH_DETECTED',
  'AI_UNAVAILABLE',
  'AI_FAILED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** One rejected field of a request. Describes the rule that failed, never the value sent. */
export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** The body of every failed API response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
