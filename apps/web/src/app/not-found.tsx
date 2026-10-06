import type { Metadata } from 'next';
import Link from 'next/link';

import { Brand } from '@/components/brand';
import { buttonVariants } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto w-full max-w-5xl px-6 py-5">
        <Brand />
      </header>
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">There is nothing at this address.</p>
        <Link href="/" className={buttonVariants({ size: 'lg' })}>
          Go to the home page
        </Link>
      </main>
    </div>
  );
}
