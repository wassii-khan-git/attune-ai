import { z } from 'zod';

/** `GET /health`: the process is up and able to answer requests. */
export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessCheckStatusSchema = z.enum(['ok', 'failed']);
export type ReadinessCheckStatus = z.infer<typeof readinessCheckStatusSchema>;

/**
 * `GET /ready`: every dependency the API needs is reachable.
 * Checks report only pass or fail; failure details stay server-side.
 */
export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.record(z.string(), readinessCheckStatusSchema),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
