import type { ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { DISCLAIMER } from '@/lib/disclaimer';

/** The frame around the sign-in and registration pages: a single centred column. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Brand />
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-6 pt-10 pb-16 sm:pt-16">
        <div className="w-full max-w-sm space-y-8">
          {children}
          <p className="text-center text-sm text-muted-foreground">{DISCLAIMER.short}</p>
        </div>
      </main>
    </div>
  );
}
