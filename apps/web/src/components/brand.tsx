import { GuardedLink } from '@/lib/navigation-guard';
import { cn } from '@/lib/utils';

/**
 * The product mark and name, as a link. The mark is a speech bubble in which
 * the bars of a voice turn into the lines of a note. `app/icon.svg` is the
 * same drawing with the colours written out, for the browser tab and for the
 * picture shown with a shared link (`app/opengraph-image.png`).
 */
export function Brand({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <GuardedLink
      href={href}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-md text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" aria-hidden className="size-7">
        <path
          d="M9 0h14a9 9 0 0 1 9 9v14a9 9 0 0 1-9 9H3a3 3 0 0 1-3-3V9a9 9 0 0 1 9-9z"
          className="fill-primary"
        />
        <path
          d="M7.6 13v6M11.6 9.5v13M15.6 12v8"
          fill="none"
          strokeWidth="2.4"
          strokeLinecap="round"
          className="stroke-primary-foreground"
        />
        <path
          d="M20.1 11.5h4.6M20.1 16h4.6M20.1 20.5h2.6"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.7"
          className="stroke-primary-foreground"
        />
      </svg>
      Attune AI
    </GuardedLink>
  );
}
