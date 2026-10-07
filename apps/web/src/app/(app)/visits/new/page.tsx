import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';

import { NewVisitForm } from '@/features/visits/new-visit-form';
import { APP_HOME } from '@/lib/navigation';
import { GuardedLink } from '@/lib/navigation-guard';

export const metadata: Metadata = { title: 'New visit' };

/** Record or upload a consultation and turn it into a note. */
export default function NewVisitPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-3">
        <GuardedLink
          href={APP_HOME}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Visits
        </GuardedLink>
        <h1 className="text-2xl font-semibold">New visit</h1>
      </div>
      <NewVisitForm />
    </div>
  );
}
