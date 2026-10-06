'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Button, buttonVariants } from '@/components/ui/button';
import { APP_HOME } from '@/lib/navigation';
import { cn } from '@/lib/utils';

import { useAuth } from './auth-provider';
import { describeAuthError } from './error-messages';

const LARGE = 'h-11 px-5 text-base';

/** The landing page's main actions: start as a guest, or create an account. */
export function HeroActions() {
  const { state, continueAsGuest } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === 'authenticated') {
    return (
      <Link href={APP_HOME} className={cn(buttonVariants(), LARGE)}>
        Open your visits
        <ArrowRight aria-hidden />
      </Link>
    );
  }

  const startAsGuest = () => {
    setError(null);
    setPending(true);
    continueAsGuest()
      .then(() => {
        router.push(APP_HOME);
      })
      .catch((cause: unknown) => {
        setError(describeAuthError(cause).form ?? 'Something went wrong. Please try again.');
        setPending(false);
      });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          className={LARGE}
          disabled={pending || state.status === 'loading'}
          onClick={startAsGuest}
        >
          {pending ? <Spinner /> : null}
          Try as guest
        </Button>
        <Link href="/register" className={cn(buttonVariants({ variant: 'outline' }), LARGE)}>
          Create an account
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        No account needed. A guest session lasts 24 hours and its data is then deleted.
      </p>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
