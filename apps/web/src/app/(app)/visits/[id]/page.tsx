import { visitIdParamsSchema } from '@attune/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { VisitView } from '@/features/visits/visit-view';

// The visit's own title stays out of the tab title and the browser history.
export const metadata: Metadata = { title: 'Visit' };

type VisitPageProps = { params: Promise<{ id: string }> };

/** One visit: its transcript and its note. */
export default async function VisitPage({ params }: VisitPageProps) {
  const parsed = visitIdParamsSchema.safeParse(await params);
  if (!parsed.success) {
    notFound();
  }
  // Keyed by the visit, so that moving from one visit to another starts from a clean slate.
  return <VisitView key={parsed.data.id} id={parsed.data.id} />;
}
