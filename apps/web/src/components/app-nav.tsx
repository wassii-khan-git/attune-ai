'use client';

import { ClipboardList, Settings, type LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { buttonVariants } from '@/components/ui/button';
import { APP_HOME, SETTINGS } from '@/lib/navigation';
import { GuardedLink } from '@/lib/navigation-guard';
import { cn } from '@/lib/utils';

const LINKS: readonly { href: string; label: string; icon: LucideIcon }[] = [
  { href: APP_HOME, label: 'Visits', icon: ClipboardList },
  { href: SETTINGS, label: 'Settings', icon: Settings },
];

/**
 * The sections of the signed-in app. On a narrow screen each link shrinks to
 * its icon; the name stays available to screen readers.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <GuardedLink
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'lg' }),
              'text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground',
            )}
          >
            <Icon aria-hidden className="sm:hidden" />
            <span className="sr-only sm:not-sr-only">{label}</span>
          </GuardedLink>
        );
      })}
    </nav>
  );
}
