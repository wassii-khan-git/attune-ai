import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from './app-error.js';
import { parseRequest } from './validation.js';

const schema = z.object({ email: z.email(), age: z.coerce.number().int().min(0) });

describe('parseRequest', () => {
  it('returns the parsed, coerced value', () => {
    expect(parseRequest(schema, { email: 'a@example.com', age: '41' })).toEqual({
      email: 'a@example.com',
      age: 41,
    });
  });

  it('throws a 400 that names each bad field and never repeats what was sent', () => {
    const sent = { email: 'synthetic-not-an-email', age: 'synthetic-not-a-number' };

    let thrown: unknown;
    try {
      parseRequest(schema, sent);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    const error = thrown as AppError;
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect(error.details?.map((detail) => detail.path)).toEqual(['email', 'age']);
    expect(JSON.stringify(error.details)).not.toContain('synthetic');
  });
});
