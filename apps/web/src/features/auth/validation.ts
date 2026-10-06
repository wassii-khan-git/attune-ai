import { loginRequestSchema, registerRequestSchema } from '@attune/shared';
import type { z } from 'zod';

export type CredentialField = 'email' | 'password';
export type FieldErrors = Partial<Record<CredentialField, string>>;

export type Validation<T> = { ok: true; data: T } | { ok: false; errors: FieldErrors };

type Values = { email: string; password: string };

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 72;

/**
 * The shared schemas decide what is valid. These functions only translate
 * their verdict into a sentence a person can act on, one per field.
 */
function describe(field: CredentialField, issue: z.core.$ZodIssue, values: Values): string {
  if (field === 'email') {
    return values.email.trim() === ''
      ? 'Enter your email address.'
      : 'Enter a valid email address.';
  }
  if (values.password === '') {
    return 'Enter your password.';
  }
  if (issue.code === 'too_small') {
    return `Use at least ${String(PASSWORD_MIN)} characters.`;
  }
  if (issue.code === 'too_big') {
    return `Use at most ${String(PASSWORD_MAX)} characters.`;
  }
  return 'Enter a valid password.';
}

function validate<S extends z.ZodType>(schema: S, values: Values): Validation<z.output<S>> {
  const result = schema.safeParse(values);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    // The first problem per field is enough; a list of every rule broken reads as noise.
    if ((field === 'email' || field === 'password') && errors[field] === undefined) {
      errors[field] = describe(field, issue, values);
    }
  }
  return { ok: false, errors };
}

/** Sign-in only checks that both fields are filled in; it must keep working if the password rules change. */
export function validateLogin(values: Values) {
  return validate(loginRequestSchema, values);
}

/** Registration applies the password rules, so the user hears about them before the server does. */
export function validateRegistration(values: Values) {
  return validate(registerRequestSchema, values);
}
