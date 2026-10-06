import { LoaderCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

/** A small activity indicator. Decorative: the surrounding control says what is happening. */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('animate-spin', className)} />;
}
