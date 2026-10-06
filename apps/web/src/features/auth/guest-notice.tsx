'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { DISCLAIMER } from '@/lib/disclaimer';

import { useAuth } from './auth-provider';

/** Tells a guest, on every page of the app, how long their data will exist. */
export function GuestNotice() {
  const { state } = useAuth();
  if (state.status !== 'authenticated' || !state.user.isGuest) {
    return null;
  }
  return (
    <Alert>
      <AlertDescription>{DISCLAIMER.guest}</AlertDescription>
    </Alert>
  );
}
