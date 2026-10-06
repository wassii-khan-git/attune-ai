import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Visits' };

/** The list of visits. For now it only has its empty state; recording and the list itself come next. */
export default function VisitsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your visits</h1>
      <div className="rounded-xl border border-dashed px-6 py-16 text-center">
        <p className="font-medium">No visits yet</p>
        <p className="mt-1 text-muted-foreground">
          A visit appears here once a consultation has been recorded.
        </p>
      </div>
    </div>
  );
}
