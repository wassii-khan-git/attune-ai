import Link from 'next/link';

import { cn } from '@/lib/utils';

/** The product mark and name, as a link. */
export function Brand({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" aria-hidden className="size-7">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M7 17h4l2.5-7 4 13 2.5-6h5"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary-foreground"
        />
      </svg>
      Attune AI
    </Link>
  );
}
