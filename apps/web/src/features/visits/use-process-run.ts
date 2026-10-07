'use client';

import { useCallback, useReducer, useRef } from 'react';

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
   * Returns to the start. An upload still in flight is cancelled, and a visit
   * that was created without getting its note is deleted, so an abandoned
   * attempt leaves nothing behind.
   */
  reset: () => void;
};

/**
 * Runs the two requests behind "Create note": create the visit, then upload
 * the recording and read the progress events the API sends back.
 *
 * The visit is created once and reused by every retry, so trying again never
 * leaves a second, empty visit behind.
 *
 * Leaving the page does not cancel a run. The API finishes it either way, so
 * the note is there on the visit when the user comes back.
 */
export function useProcessRun(): ProcessRun {
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
      dispatch({ type: 'started' });

      // Written by the event callback below, read after the request has ended.
      const seen = { anyEvent: false, lastEvent: false };
      try {
        let id = visitId.current;
        if (id === null) {
          // The form only gets this far with the consent box ticked.
          id = (await api.visits.create({ title, consentGiven: true })).visit.id;
          if (controller.signal.aborted) {
            deleteVisit(id);
            return;
          }
          visitId.current = id;
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
              saved.current ||= event.type === 'done';
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
          dispatch({ type: 'finished-earlier' });
          return;
        }
        dispatch({ type: 'failed', failure: describeRunError(error, seen.anyEvent) });
      }
    },
    [api, deleteVisit],
  );

  const start = useCallback(
    (next: NewVisitInput) => {
      input.current = next;
      void run(next);
    },
    [run],
  );

  const retry = useCallback(() => {
    if (input.current !== null) {
      void run(input.current);
    }
  }, [run]);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    if (visitId.current !== null && !saved.current) {
      deleteVisit(visitId.current);
    }
    visitId.current = null;
    saved.current = false;
    input.current = null;
    dispatch({ type: 'reset' });
  }, [deleteVisit]);

  return { state, start, retry, reset };
}
