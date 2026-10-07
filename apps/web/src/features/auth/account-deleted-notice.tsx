'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useAuth } from './auth-provider';

/** Confirms, on the page a deleted account lands on, that the deletion went through. */
export function AccountDeletedNotice() {
  const { state } = useAuth();
  if (state.status !== 'anonymous' || state.reason !== 'deleted') {
    return null;
  }
  return (
    <Alert role="status">
      <AlertTitle>Your account has been deleted</AlertTitle>
      <AlertDescription>Every visit, transcript and note in it has been removed.</AlertDescription>
    </Alert>
  );
}
