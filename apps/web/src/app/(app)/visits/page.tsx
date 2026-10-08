import type { Metadata } from 'next';

import { VisitList } from '@/features/visits/visit-list';

export const metadata: Metadata = { title: 'Visits' };

/** The home of the signed-in app: a welcome, then the list of visits. */
export default function VisitsPage() {
  return <VisitList />;
}
