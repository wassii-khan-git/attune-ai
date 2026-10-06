import { z } from 'zod';

import { AppError } from './app-error.js';

const positionSchema = z.object({
  t: z.iso.datetime(),
  i: z.uuid(),
});

export type PagePosition = {
  createdAt: Date;
  id: string;
};

/** Clients treat the cursor as opaque, so its contents can change without breaking them. */
export function encodePageCursor({ createdAt, id }: PagePosition): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), i: id }), 'utf8').toString(
    'base64url',
  );
}

/** Rejects anything that is not a cursor this API issued, with a 400 that names the parameter. */
export function decodePageCursor(cursor: string): PagePosition {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const { t, i } = positionSchema.parse(parsed);
    return { createdAt: new Date(t), id: i };
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'The request is not valid.', {
      details: [{ path: 'cursor', message: 'Invalid cursor' }],
    });
  }
}
