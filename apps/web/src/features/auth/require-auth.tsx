'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { Spinner } from '@/components/spinner';

import { useAuth } from './auth-provider';

/**
 * Shows its children only to a signed-in user. A visitor is sent to the
 * sign-in page with a way back; someone who has just signed out goes home.
 *
 * This is for the user's convenience, not for protection: the API refuses
 * every request that lacks a valid session, whatever the page shows.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status !== 'anonymous') {
      return;
    }
    router.replace(
      state.reason === 'signed-out' ? '/' : `/login?next=${encodeURIComponent(pathname)}`,
    );
  }, [state, pathname, router]);

  if (state.status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        <Spinner className="size-6 text-muted-foreground" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  return children;
}
