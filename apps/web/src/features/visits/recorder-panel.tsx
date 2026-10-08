'use client';

import { MAX_RECORDING_SEC } from '@attune/shared';
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { Spinner } from '@/components/spinner';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { Recorder, RecorderIssue } from './use-recorder';
import { Waveform } from './waveform';

const ISSUE_TEXT: Record<RecorderIssue, string> = {
  unsupported: 'This browser cannot record audio here. Upload a file or use a sample instead.',
  'permission-denied':
    'Microphone access is blocked. Allow it for this site in your browser settings, then try again.',
  'no-microphone': 'No microphone was found. Connect one, or upload a file instead.',
  failed:
    'Recording could not start. Check that no other app is using the microphone, then try again.',
  'too-short': 'That recording was too short to use. Record at least one second.',
};

/** The timer turns red for the last stretch, so the limit does not come as a surprise. */
const WARN_WHEN_LEFT_SEC = 30;
const LIMIT_MINUTES = String(MAX_RECORDING_SEC / 60);

type RecorderPanelProps = {
  recorder: Recorder;
  /** Called for the start button. The form asks for consent before it lets recording begin. */
  onStart: () => void;
};

/** The microphone controls: a start button, then a timer, a live waveform and a stop button. */
export function RecorderPanel({ recorder, onStart }: RecorderPanelProps) {
  const { state, elapsedSec } = recorder;
  const stopRef = useRef<HTMLButtonElement>(null);

  // "Start" has just been replaced by "Stop": keep the keyboard where the action is.
  const recording = state.status === 'recording';
  useEffect(() => {
    if (recording) {
      stopRef.current?.focus();
    }
  }, [recording]);

  if (state.status === 'recording') {
    const endingSoon = MAX_RECORDING_SEC - elapsedSec <= WARN_WHEN_LEFT_SEC;
    return (
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <p role="status" className="flex items-center gap-2 font-medium">
            <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-destructive" />
            Recording
          </p>
          <p
            role="timer"
            aria-label="Recording time"
            className={cn('font-mono text-sm tabular-nums', endingSoon && 'text-destructive')}
          >
            {formatDuration(elapsedSec)}
            <span className="text-muted-foreground"> / {formatDuration(MAX_RECORDING_SEC)}</span>
          </p>
        </div>
        <Waveform analyser={state.analyser} />
        <Button
          ref={stopRef}
          type="button"
          variant="outline"
          className="h-11 px-5 text-base"
          onClick={recorder.stop}
        >
          <Square aria-hidden />
          Stop recording
        </Button>
      </div>
    );
  }

  const requesting = state.status === 'requesting';
  return (
    <div className="space-y-3 rounded-xl border border-dashed px-6 py-8 text-center">
      <Button type="button" className="h-11 px-5 text-base" disabled={requesting} onClick={onStart}>
        {requesting ? <Spinner /> : <Mic aria-hidden />}
        {requesting ? 'Waiting for the microphone…' : 'Start recording'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Up to {LIMIT_MINUTES} minutes. The recording stays in this browser tab until you create the
        note.
      </p>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {ISSUE_TEXT[state.issue]}
        </p>
      )}
    </div>
  );
}
