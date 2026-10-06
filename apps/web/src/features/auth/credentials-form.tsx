'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import { Spinner } from '@/components/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import { useAuth, type SignedOutReason } from './auth-provider';
import { describeAuthError } from './error-messages';
import { PasswordField, TextField } from './form-fields';
import {
  validateLogin,
  validateRegistration,
  type CredentialField,
  type FieldErrors,
} from './validation';

type Mode = 'login' | 'register';

const COPY = {
  login: {
    submit: 'Sign in',
    busy: 'Signing in…',
    passwordAutoComplete: 'current-password',
    alternative: { prompt: 'New here?', label: 'Create an account', href: '/register' },
  },
  register: {
    submit: 'Create account',
    busy: 'Creating your account…',
    passwordAutoComplete: 'new-password',
    alternative: { prompt: 'Already have an account?', label: 'Sign in', href: '/login' },
  },
} as const;

const SIGNED_OUT_NOTICE: Partial<Record<SignedOutReason, string>> = {
  idle: 'You were signed out after 15 minutes without activity.',
  expired: 'Your session has ended. Sign in again to continue.',
};

type CredentialsFormProps = {
  mode: Mode;
  /** Where to go once signed in. Already checked to be a path on this site. */
  next: string;
};

/**
 * The sign-in and registration form. Input is checked in the browser first,
 * with the same rules the API applies, so most mistakes are caught without a
 * round trip; whatever the server still refuses is shown next to the field it
 * concerns, or above the form when it concerns no single field.
 */
export function CredentialsForm({ mode, next }: CredentialsFormProps) {
  const { state, login, register } = useAuth();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const focusFirstError = useRef(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const copy = COPY[mode];

  // Already signed in, or just signed in: leave this page.
  useEffect(() => {
    if (state.status === 'authenticated') {
      router.replace(next);
    }
  }, [state.status, next, router]);

  // After a failed submit, put the cursor where the first problem is.
  useEffect(() => {
    if (focusFirstError.current) {
      focusFirstError.current = false;
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [fieldErrors]);

  const showErrors = (errors: FieldErrors, form: string | null = null) => {
    focusFirstError.current = Object.keys(errors).length > 0;
    setFieldErrors(errors);
    setFormError(form);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      email: typeof data.get('email') === 'string' ? (data.get('email') as string) : '',
      password: typeof data.get('password') === 'string' ? (data.get('password') as string) : '',
    };

    const checked = mode === 'login' ? validateLogin(values) : validateRegistration(values);
    if (!checked.ok) {
      showErrors(checked.errors);
      return;
    }

    showErrors({});
    setPending(true);
    (mode === 'login' ? login(checked.data) : register(checked.data)).catch((cause: unknown) => {
      const failure = describeAuthError(cause);
      showErrors(failure.fields ?? {}, failure.form ?? null);
      setPending(false);
    });
  };

  // Typing in a field clears its message; it will be checked again on submit.
  const clearError = (field: CredentialField) => () => {
    if (fieldErrors[field] !== undefined) {
      setFieldErrors(({ [field]: _cleared, ...rest }) => rest);
    }
  };

  const notice =
    mode === 'login' && state.status === 'anonymous' && state.reason !== undefined
      ? SIGNED_OUT_NOTICE[state.reason]
      : undefined;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
      {notice !== undefined && formError === null && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {formError !== null && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        error={fieldErrors.email}
        onInput={clearError('email')}
      />
      <PasswordField
        name="password"
        label="Password"
        autoComplete={copy.passwordAutoComplete}
        required
        error={fieldErrors.password}
        onInput={clearError('password')}
        {...(mode === 'register'
          ? { hint: 'At least 10 characters. A short sentence works well.' }
          : {})}
      />

      <Button type="submit" disabled={pending} className="h-11 w-full text-base">
        {pending ? <Spinner /> : null}
        {pending ? copy.busy : copy.submit}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {copy.alternative.prompt}{' '}
        <Link
          href={copy.alternative.href}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          {copy.alternative.label}
        </Link>
      </p>
    </form>
  );
}
