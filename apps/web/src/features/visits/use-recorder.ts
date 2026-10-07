'use client';

import { MAX_RECORDING_SEC } from '@attune/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  RecorderError,
  startRecorderSession,
  type FinishedRecording,
  type RecorderProblem,
  type RecorderSession,
} from '@/lib/audio/recorder-session';

const LIMIT_MS = MAX_RECORDING_SEC * 1000;
const SHORTEST_MS = 1_000;
const TICK_MS = 200;

export type RecorderIssue = RecorderProblem | 'too-short';
export type EndedBy = 'user' | 'limit';

export type RecorderState =
  | { status: 'idle' }
  /** Waiting for the browser's microphone prompt to be answered. */
  | { status: 'requesting' }
  | { status: 'recording'; analyser: AnalyserNode }
  | { status: 'error'; issue: RecorderIssue };

export type Recorder = {
  state: RecorderState;
  /** Whole seconds recorded so far. */
  elapsedSec: number;
  start: () => void;
  stop: () => void;
};

/**
 * Records from the microphone, up to the time limit, and hands the finished
 * recording to `onRecorded`. A recording that reaches the limit is stopped
 * and kept, not thrown away. Leaving the page releases the microphone and
 * discards whatever was being recorded.
 */
export function useRecorder(
  onRecorded: (recording: FinishedRecording, endedBy: EndedBy) => void,
): Recorder {
  const [state, setState] = useState<RecorderState>({ status: 'idle' });
  const [elapsedSec, setElapsedSec] = useState(0);

  const session = useRef<RecorderSession | null>(null);
  const starting = useRef(false);
  const endedBy = useRef<EndedBy>('user');
  const mounted = useRef(false);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const discard = useCallback(() => {
    session.current?.discard();
    session.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard();
    };
  }, [discard]);

  const start = useCallback(() => {
    if (starting.current || session.current !== null) {
      return;
    }
    starting.current = true;
    endedBy.current = 'user';
    setElapsedSec(0);
    setState({ status: 'requesting' });

    const finish = (recording: FinishedRecording): void => {
      session.current = null;
      if (!mounted.current) {
        return;
      }
      if (recording.durationMs < SHORTEST_MS || recording.blob.size === 0) {
        setState({ status: 'error', issue: 'too-short' });
        return;
      }
      setState({ status: 'idle' });
      onRecordedRef.current(recording, endedBy.current);
    };

    startRecorderSession(finish)
      .then(
        (started) => {
          // The page was left while the microphone prompt was open.
          if (!mounted.current) {
            started.discard();
            return;
          }
          session.current = started;
          setState({ status: 'recording', analyser: started.analyser });
        },
        (error: unknown) => {
          if (mounted.current) {
            const issue = error instanceof RecorderError ? error.problem : 'failed';
            setState({ status: 'error', issue });
          }
        },
      )
      .finally(() => {
        starting.current = false;
      });
  }, []);

  const stop = useCallback(() => {
    session.current?.stop();
  }, []);

  const recording = state.status === 'recording';
  useEffect(() => {
    if (!recording) {
      return;
    }
    const timer = setInterval(() => {
      const current = session.current;
      if (current === null) {
        return;
      }
      const elapsedMs = current.elapsedMs();
      setElapsedSec(Math.min(Math.floor(elapsedMs / 1000), MAX_RECORDING_SEC));
      if (elapsedMs >= LIMIT_MS) {
        endedBy.current = 'limit';
        current.stop();
      }
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [recording]);

  return { state, elapsedSec, start, stop };
}
