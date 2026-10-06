'use client';

import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { APP_HOME } from '@/lib/navigation';

import { useAuth } from './auth-provider';

/** The header link that leads into the app: "Sign in" for a visitor, "Open app" once signed in. */
export function AuthNav() {
  const { state } = useAuth();

  // Nothing while the session is being checked, so the link does not flip a moment after load.
  if (state.status === 'loading') {
    return null;
  }
  return state.status === 'authenticated' ? (
    <Link href={APP_HOME} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
      Open app
    </Link>
  ) : (
    <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
      Sign in
    </Link>
  );
}
