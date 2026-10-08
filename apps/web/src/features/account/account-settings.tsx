'use client';

import { History, LockKeyhole, LogOut, MicOff, Timer, UserRound } from 'lucide-react';
import { useState } from 'react';

import { ConfirmAction } from '@/components/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-provider';
import { describeRequestError } from '@/lib/api/describe-error';
import { formatDateTime } from '@/lib/format';
import { useConfirmLeave } from '@/lib/navigation-guard';
import { IDLE_LIMIT_MS } from '@/lib/session/idle-monitor';

import { SettingsRow, SettingsSection } from './settings-section';
import { ThemeSetting } from './theme-setting';

/** How long a guest session lasts from the moment it starts. The API holds the rule; this only shows it. */
const GUEST_SESSION_MS = 24 * 60 * 60 * 1000;
const IDLE_MINUTES = String(IDLE_LIMIT_MS / 60_000);

/**
 * The settings page: who is signed in, how the app looks, what happens to the
 * data, and the way to delete the account with everything in it. After a
 * deletion the session is over, and the app sends the browser home.
 */
export function AccountSettings() {
  const { state, logout, deleteAccount } = useAuth();
  const confirmLeave = useConfirmLeave();
  const [deletion, setDeletion] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });

  if (state.status !== 'authenticated') {
    return null;
  }
  const { user } = state;
  const name = user.email ?? 'Guest session';

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
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">
          Your account, how the app looks, and what happens to your data.
        </p>
      </div>

      <SettingsSection
        id="account-heading"
        title="Account"
        description="Who is signed in on this browser."
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground"
            >
              {user.email === null ? (
                <UserRound className="size-5" />
              ) : (
                user.email.charAt(0).toUpperCase()
              )}
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium break-all">{name}</p>
              <p className="text-sm text-muted-foreground">
                {user.isGuest ? 'Temporary, with no sign-in details' : 'Signs in with a password'}
              </p>
            </div>
          </div>
          <Badge variant="secondary">{user.isGuest ? 'Guest' : 'Account'}</Badge>
        </div>
        <dl className="grid gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatDateTime(user.createdAt)}</dd>
          {user.isGuest && (
            <>
              <dt className="text-muted-foreground">Session ends</dt>
              <dd>
                {formatDateTime(
                  new Date(Date.parse(user.createdAt) + GUEST_SESSION_MS).toISOString(),
                )}
                , and its data is then deleted
              </dd>
            </>
          )}
        </dl>
        <SettingsRow label="Sign out" hint="Ends the session on this browser.">
          <Button
            type="button"
            variant="outline"
            className="h-10 px-4"
            onClick={() => {
              if (confirmLeave()) {
                void logout();
              }
            }}
          >
            <LogOut aria-hidden />
            Sign out
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="appearance-heading"
        title="Appearance"
        description="Kept on this browser only."
      >
        <SettingsRow label="Theme" hint="System follows the setting of your device.">
          <ThemeSetting />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="privacy-heading"
        title="Privacy and data"
        description="How this demo treats what you put into it. Use synthetic data only."
      >
        <SettingsRow
          icon={<MicOff />}
          label="Recordings are not kept"
          hint="A recording is used once to create the note, then discarded."
        />
        <SettingsRow
          icon={<LockKeyhole />}
          label="Transcripts and notes are encrypted"
          hint="Each one is encrypted before it reaches the database."
        />
        <SettingsRow
          icon={<History />}
          label="Access is recorded"
          hint="Opening, editing or deleting a visit writes an audit entry, with no clinical content in it."
        />
        <SettingsRow
          icon={<Timer />}
          label="Idle sessions end"
          hint={`You are signed out after ${IDLE_MINUTES} minutes without activity.`}
        />
      </SettingsSection>

      <SettingsSection
        id="delete-account-heading"
        title="Danger zone"
        description="What is deleted here cannot be brought back."
        tone="danger"
      >
        <SettingsRow
          label={user.isGuest ? 'Delete this guest session' : 'Delete your account'}
          hint="Removes the account and every visit, transcript and note in it, at once. A record that an account was deleted stays in the audit log; it holds no personal data."
        >
          <ConfirmAction
            label={user.isGuest ? 'Delete guest session' : 'Delete account'}
            question="Delete the account and everything in it for good?"
            confirmLabel="Yes, delete everything"
            busyLabel="Deleting…"
            busy={deletion.busy}
            error={deletion.error}
            className="basis-full"
            onConfirm={remove}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
