'use client';

import Link from 'next/link';

import { Brand } from '@/components/brand';
import { Button, buttonVariants } from '@/components/ui/button';

type ErrorPageProps = {
  error: Error;
  /** Renders the failed part of the page again. */
  reset: () => void;
};

/**
 * Shown when a page fails while rendering. It says nothing about the error
 * itself: its text could quote the data the page was showing.
 */
export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-5xl px-6 py-5">
        <Brand />
      </header>
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-muted-foreground">
          This page ran into a problem. What you have saved is safe. Try again, or go back to the
          home page.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button type="button" size="lg" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Go to the home page
          </Link>
        </div>
      </main>
    </div>
  );
}
