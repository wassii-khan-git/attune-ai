import type { ReactNode } from 'react';

import { Brand } from '@/components/brand';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { GuestNotice } from '@/features/auth/guest-notice';
import { RequireAuth } from '@/features/auth/require-auth';
import { UserMenu } from '@/features/auth/user-menu';
import { ProcessRunProvider } from '@/features/visits/process-run-provider';
import { APP_HOME } from '@/lib/navigation';

/** The frame around every signed-in page. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b print:hidden">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
            <Brand href={APP_HOME} />
            <div className="flex items-center gap-1">
              <UserMenu />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-10">
          <div className="print:hidden">
            <GuestNotice />
          </div>
          <ProcessRunProvider>{children}</ProcessRunProvider>
        </main>

        <SiteFooter />
      </div>
    </RequireAuth>
  );
}
