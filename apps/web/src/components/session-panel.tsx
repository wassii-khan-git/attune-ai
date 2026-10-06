'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { isApiError } from '@/lib/api/errors';

/** Shows the session the app currently has. A stand-in until the sign-in pages exist. */
export function SessionPanel() {
  const { state, continueAsGuest, logout } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = (action: () => Promise<void>) => {
    setError(null);
    setPending(true);
    action()
      .catch((cause: unknown) => {
        setError(isApiError(cause) ? cause.message : 'Something went wrong. Please try again.');
      })
      .finally(() => {
        setPending(false);
      });
  };

  return (
    <section aria-labelledby="session-heading" className="rounded-xl border bg-card p-6">
      <h2 id="session-heading" className="text-sm font-medium text-muted-foreground">
        Session
      </h2>

      <p className="mt-2 text-lg" aria-live="polite">
        {state.status === 'loading' && 'Checking for a session…'}
        {state.status === 'authenticated' &&
          (state.user.isGuest ? 'Signed in as a guest' : `Signed in as ${state.user.email ?? ''}`)}
        {state.status === 'anonymous' &&
          (state.reason === 'idle'
            ? 'Signed out after 15 minutes without activity'
            : 'Not signed in')}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {state.status === 'authenticated' ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              run(logout);
            }}
          >
            Sign out
          </Button>
        ) : (
          <Button
            disabled={pending || state.status === 'loading'}
            onClick={() => {
              run(continueAsGuest);
            }}
          >
            Try as guest
          </Button>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
