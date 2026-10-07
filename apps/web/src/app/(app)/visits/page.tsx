import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Visits' };

const NEW_VISIT = '/visits/new';

/** The home of the signed-in app. For now it only leads to a new visit; the list itself comes next. */
export default function VisitsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your visits</h1>
        <Link href={NEW_VISIT} className={cn(buttonVariants(), 'h-11 px-5 text-base')}>
          <Plus aria-hidden />
          New visit
        </Link>
      </div>
      <div className="rounded-xl border border-dashed px-6 py-16 text-center">
        <p className="font-medium">Record a consultation to draft its note</p>
        <p className="mt-1 text-muted-foreground">
          Start a new visit to record, upload or try a sample conversation.
        </p>
      </div>
    </div>
  );
}
