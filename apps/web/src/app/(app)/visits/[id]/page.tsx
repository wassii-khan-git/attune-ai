import { visitIdParamsSchema } from '@attune/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { VisitView } from '@/features/visits/visit-view';

// The visit's own title stays out of the tab title and the browser history.
export const metadata: Metadata = { title: 'Visit' };

type VisitPageProps = { params: Promise<{ id: string }> };

/** One visit: its note, with the transcript one click away. */
export default async function VisitPage({ params }: VisitPageProps) {
  const parsed = visitIdParamsSchema.safeParse(await params);
  if (!parsed.success) {
    notFound();
  }
  // Keyed by the visit, so that moving from one visit to another starts from a clean slate.
  // The column is as wide as a note reads comfortably.
  return (
    <div className="mx-auto max-w-3xl">
      <VisitView key={parsed.data.id} id={parsed.data.id} />
    </div>
  );
}
