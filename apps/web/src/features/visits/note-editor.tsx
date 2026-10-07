'use client';

import { NOTE_SECTION_MAX_LENGTH, type SoapNote } from '@attune/shared';
import { Check, Printer } from 'lucide-react';

import { AutoTextarea } from '@/components/auto-textarea';
import { CopyButton } from '@/components/copy-button';
import { Spinner } from '@/components/spinner';
import { Button } from '@/components/ui/button';
import { DISCLAIMER } from '@/lib/disclaimer';

import { NOTE_SECTIONS, noteToText, sectionText } from './note-text';
import { useNoteEditor, type SaveState } from './use-note-editor';

/** Says, next to the heading, whether what is on the page has been saved. */
function SaveIndicator({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      {save.status === 'saved' && (
        <>
          <Check aria-hidden className="size-4" />
          Saved
        </>
      )}
      {save.status === 'unsaved' && 'Unsaved changes'}
      {save.status === 'saving' && (
        <>
          <Spinner className="size-4" />
          Saving…
        </>
      )}
      {save.status === 'failed' && (
        <>
          <span className="text-destructive">{save.message}</span>
          <Button type="button" variant="outline" onClick={onRetry}>
            Save now
          </Button>
        </>
      )}
    </div>
  );
}

type NoteEditorProps = {
  visitId: string;
  /** Goes at the top of a copied note. */
  title: string;
  initialNote: SoapNote;
};

/**
 * The note in its four sections, each one editable and saved as it is typed.
 * The same text can be copied as plain text, or printed, which is also how it
 * is saved as a PDF: on paper each section appears as plain text.
 */
export function NoteEditor({ visitId, title, initialNote }: NoteEditorProps) {
  const { note, save, edit, saveNow } = useNoteEditor(visitId, initialNote);

  return (
    <section aria-labelledby="note-heading" className="space-y-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="note-heading" className="text-lg font-semibold">
            Note
          </h2>
          <div className="print:hidden">
            <SaveIndicator save={save} onRetry={saveNow} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{DISCLAIMER.draft}</p>
        <div className="flex flex-wrap gap-2 print:hidden">
          <CopyButton
            label="Copy note"
            className="h-9 px-3"
            getText={() => noteToText(note, title)}
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 px-3"
            onClick={() => {
              window.print();
            }}
          >
            <Printer aria-hidden />
            Print or save as PDF
          </Button>
        </div>
      </div>

      {NOTE_SECTIONS.map(({ key, label }) => (
        <div key={key} className="space-y-2">
          <label htmlFor={`note-${key}`} className="block text-sm font-semibold">
            {label}
          </label>
          <AutoTextarea
            id={`note-${key}`}
            value={note[key]}
            maxLength={NOTE_SECTION_MAX_LENGTH}
            // Keeps the text out of the browser's saved form data and session restore.
            autoComplete="off"
            className="print:hidden"
            onChange={(event) => {
              edit(key, event.target.value);
            }}
            onBlur={saveNow}
          />
          {/* A text area prints as a clipped box, so paper gets the text itself. */}
          <p className="hidden leading-relaxed whitespace-pre-wrap print:block">
            {sectionText(note[key])}
          </p>
        </div>
      ))}
    </section>
  );
}
