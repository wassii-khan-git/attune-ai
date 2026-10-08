'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth/auth-provider';
import { isApiError } from '@/lib/api/errors';

import {
  describeInterruption,
  describeRunError,
  IDLE,
  reduceRun,
  type RunState,
} from './process-run';
import type { NewVisitInput } from './validation';

export type ProcessRun = {
  state: RunState;
  /** Creates the visit, uploads the recording and follows the run to its end. */
  start: (input: NewVisitInput) => void;
  /** Sends the same recording again, to the visit the first attempt created. */
  retry: () => void;
  /**
   * Gives up on the attempt. An upload still in flight is cancelled, and a
   * visit that was created without getting its note is deleted, so an
   * abandoned attempt leaves nothing behind.
   */
  abandon: () => void;
  /** Forgets the run and the recording, and leaves the visit as it is. */
  clear: () => void;
};

const ProcessRunContext = createContext<ProcessRun | null>(null);

/**
 * Runs the two requests behind "Create note": create the visit, then upload
 * the recording and read the events the API sends back.
 *
 * It sits above the pages of the signed-in app, so a run that starts on the
 * new-visit page carries on while the browser moves to the visit's own page,
 * which shows the transcript and the note as they arrive. One run at a time.
 *
 * The visit is created once and reused by every retry, so trying again never
 * leaves a second, empty visit behind. The recording is held only until the
 * run succeeds or is given up.
 */
export function ProcessRunProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const [state, dispatch] = useReducer(reduceRun, IDLE);

  const input = useRef<NewVisitInput | null>(null);
  const visitId = useRef<string | null>(null);
  const saved = useRef(false);
  const inFlight = useRef<AbortController | null>(null);

  const deleteVisit = useCallback(
    (id: string) => {
      // Best effort. If it fails, the empty visit stays in the list, where it can be deleted by hand.
      void api.visits.remove(id).catch(() => undefined);
    },
    [api],
  );

  const run = useCallback(
    async ({ title, audio }: NewVisitInput): Promise<void> => {
      const controller = new AbortController();
      inFlight.current = controller;
      dispatch({ type: 'started', title, visitId: visitId.current });

      // Written by the event callback below, read after the request has ended.
      const seen = { anyEvent: false, lastEvent: false };
      try {
        let id = visitId.current;
        if (id === null) {
          // The form only gets this far once consent has been confirmed in its dialog.
          id = (await api.visits.create({ title, consentGiven: true })).visit.id;
          if (controller.signal.aborted) {
            deleteVisit(id);
            return;
          }
          visitId.current = id;
          dispatch({ type: 'visit-created', visitId: id });
        }

        await api.visits.process(
          id,
          { audio: audio.blob, fileName: audio.fileName, durationSec: audio.durationSec },
          {
            signal: controller.signal,
            onUploadProgress: (fraction) => {
              dispatch({ type: 'upload-progress', fraction });
            },
            onEvent: (event) => {
              seen.anyEvent = true;
              seen.lastEvent ||= event.type === 'done' || event.type === 'error';
              if (event.type === 'done') {
                saved.current = true;
                // The note exists now, so the recording has no further use.
                input.current = null;
              }
              dispatch({ type: 'event', event });
            },
          },
        );
        if (!seen.lastEvent) {
          dispatch({ type: 'failed', failure: describeInterruption() });
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        // Only an earlier attempt with this same recording can have written a
        // note to a visit this page created moments ago: that attempt finished.
        if (isApiError(error) && error.code === 'NOTE_EXISTS') {
          saved.current = true;
          input.current = null;
          dispatch({ type: 'finished-earlier' });
          return;
        }
        dispatch({ type: 'failed', failure: describeRunError(error, seen.anyEvent) });
      }
    },
    [api, deleteVisit],
  );

  const forget = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    visitId.current = null;
    saved.current = false;
    input.current = null;
    dispatch({ type: 'reset' });
  }, []);

  const value = useMemo<ProcessRun>(
    () => ({
      state,
      start: (next) => {
        forget();
        input.current = next;
        void run(next);
      },
      retry: () => {
        if (input.current !== null) {
          void run(input.current);
        }
      },
      abandon: () => {
        if (visitId.current !== null && !saved.current) {
          deleteVisit(visitId.current);
        }
        forget();
      },
      clear: forget,
    }),
    [state, run, forget, deleteVisit],
  );

  return <ProcessRunContext value={value}>{children}</ProcessRunContext>;
}

export function useProcessRun(): ProcessRun {
  const value = useContext(ProcessRunContext);
  if (value === null) {
    throw new Error('useProcessRun must be used inside <ProcessRunProvider>');
  }
  return value;
}
