'use client';

import { useState } from 'react';

import { ConfirmAction } from '@/components/confirm-action';
import { useAuth } from '@/features/auth/auth-provider';
import { describeRequestError } from '@/lib/api/describe-error';
import { DISCLAIMER } from '@/lib/disclaimer';
import { formatDateTime } from '@/lib/format';

/**
 * Who is signed in, and the way to delete the account with everything in it.
 * After a deletion the session is over, and the app sends the browser home.
 */
export function AccountSettings() {
  const { state, deleteAccount } = useAuth();
  const [deletion, setDeletion] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });

  if (state.status !== 'authenticated') {
    return null;
  }
  const { user } = state;

  const remove = (): void => {
    setDeletion({ busy: true, error: null });
    deleteAccount().catch((error: unknown) => {
      setDeletion({
        busy: false,
        error: describeRequestError(error, 'Your account could not be deleted. Please try again.'),
      });
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section aria-labelledby="account-heading" className="space-y-4">
        <h2 id="account-heading" className="text-lg font-semibold">
          Account
        </h2>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[auto_1fr]">
          <dt className="text-sm text-muted-foreground">Signed in as</dt>
          <dd className="break-all">{user.email ?? 'Guest'}</dd>
          <dt className="text-sm text-muted-foreground">Created</dt>
          <dd>{formatDateTime(user.createdAt)}</dd>
        </dl>
        {user.isGuest && <p className="text-sm text-muted-foreground">{DISCLAIMER.guest}</p>}
      </section>

      <section aria-labelledby="delete-account-heading" className="space-y-3 border-t pt-8">
        <h2 id="delete-account-heading" className="text-lg font-semibold">
          Delete {user.isGuest ? 'this guest session' : 'your account'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Removes the account and every visit, transcript and note in it, at once. This cannot be
          undone. A record that an account was deleted stays in the audit log; it holds no personal
          data.
        </p>
        <ConfirmAction
          label={user.isGuest ? 'Delete guest session' : 'Delete account'}
          question="Delete the account and everything in it for good?"
          confirmLabel="Yes, delete everything"
          busyLabel="Deleting…"
          busy={deletion.busy}
          error={deletion.error}
          onConfirm={remove}
        />
      </section>
    </div>
  );
}
