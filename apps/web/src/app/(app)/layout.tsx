import type { ReactNode } from 'react';

import { AppNav } from '@/components/app-nav';
import { Brand } from '@/components/brand';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { GuestNotice } from '@/features/auth/guest-notice';
import { RequireAuth } from '@/features/auth/require-auth';
import { UserMenu } from '@/features/auth/user-menu';
import { ProcessRunProvider } from '@/features/visits/process-run-provider';
import { APP_HOME } from '@/lib/navigation';

/**
 * The frame around every signed-in page. The header and footer are plain
 * markup that needs no session, so they are on screen at once; only the
 * content between them waits for the session check.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b print:hidden">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <Brand href={APP_HOME} />
            <AppNav />
          </div>
          <div className="flex items-center gap-1">
            <UserMenu />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-10">
        <RequireAuth>
          <div className="print:hidden">
            <GuestNotice />
          </div>
          <ProcessRunProvider>{children}</ProcessRunProvider>
        </RequireAuth>
      </main>

      <SiteFooter />
    </div>
  );
}
