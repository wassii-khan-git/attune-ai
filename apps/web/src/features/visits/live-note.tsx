import { NOTE_SECTIONS } from './note-text';
import type { NoteDraft } from './process-run';

/**
 * The note while it is being written: each section shows the text that has
 * arrived so far, and a placeholder until its first words do. It becomes
 * editable when the run is done and the finished note takes its place.
 */
export function LiveNote({ note }: { note: NoteDraft }) {
  return (
    <section aria-labelledby="note-heading" aria-busy className="space-y-5">
      <h2 id="note-heading" className="text-lg font-semibold">
        Note
      </h2>
      {NOTE_SECTIONS.map(({ key, label }) => {
        const text = note[key];
        return (
          <div key={key} className="space-y-2">
            <h3 className="text-sm font-semibold">{label}</h3>
            {text === undefined || text === '' ? (
              <div aria-hidden className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            ) : (
              <p className="leading-relaxed whitespace-pre-wrap">{text}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
