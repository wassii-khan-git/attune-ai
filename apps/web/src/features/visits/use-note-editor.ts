'use client';

import type { SoapNote } from '@attune/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { createAutosaver, type Autosaver, type SaveStatus } from '@/lib/autosave';

import type { NoteSectionKey } from './note-text';
import { describeSaveError } from './visit-errors';

export type SaveState = {
  status: SaveStatus;
  /** Why the last save failed, when it did. */
  message?: string;
};

export type NoteEditor = {
  /** The note as it stands on the page, saved or not. */
  note: SoapNote;
  save: SaveState;
  edit: (section: NoteSectionKey, text: string) => void;
  /** Saves at once instead of waiting for a pause in typing. */
  saveNow: () => void;
};

/**
 * Holds a note while it is edited and saves it without being asked: after a
 * pause in typing, when a field is left, and when the page is left.
 *
 * An edit is never thrown away. If a save fails, the text stays on the page,
 * the reason is shown, and the save is tried again where that can help. The
 * browser also warns before a reload or a closed tab loses unsaved text.
 */
export function useNoteEditor(visitId: string, initial: SoapNote): NoteEditor {
  const { api } = useAuth();
  const [note, setNote] = useState(initial);
  const [save, setSave] = useState<SaveState>({ status: 'saved' });
  const autosaver = useRef<Autosaver<SoapNote> | null>(null);

  useEffect(() => {
    const created = createAutosaver<SoapNote>({
      save: async (value) => {
        await api.visits.updateNote(visitId, value);
      },
      shouldRetry: (error) => describeSaveError(error).retry,
      onStatus: (status, error) => {
        setSave(
          status === 'failed' ? { status, message: describeSaveError(error).message } : { status },
        );
      },
    });
    autosaver.current = created;
    return () => {
      // Leaving the page by a link: send what is still waiting.
      void created.flush();
      created.dispose();
      autosaver.current = null;
    };
  }, [api, visitId]);

  const unsaved = save.status !== 'saved';
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [unsaved]);

  const edit = (section: NoteSectionKey, text: string): void => {
    const next = { ...note, [section]: text };
    setNote(next);
    autosaver.current?.change(next);
  };

  const saveNow = useCallback(() => {
    void autosaver.current?.flush();
  }, []);

  return { note, save, edit, saveNow };
}
