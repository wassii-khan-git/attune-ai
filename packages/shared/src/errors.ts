import { z } from 'zod';

/** Machine-readable error codes. Clients branch on these, never on the message text. */
export const errorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
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
