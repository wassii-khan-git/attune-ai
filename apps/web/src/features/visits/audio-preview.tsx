'use client';

import { useEffect, useRef, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import { formatBytes, formatDuration } from '@/lib/format';

import type { SelectedAudio } from './selected-audio';

type AudioPreviewProps = {
  audio: SelectedAudio;
  onRemove: () => void;
  /** The form moves the focus here when audio has just been chosen. */
  ref?: Ref<HTMLDivElement>;
};

/** Shows the audio that was chosen, with a player to check it before it is sent. */
export function AudioPreview({ audio, onRemove, ref }: AudioPreviewProps) {
  const playerRef = useRef<HTMLAudioElement>(null);

  // The player reads the audio from memory through a temporary address, withdrawn when it is no longer shown.
  useEffect(() => {
    const player = playerRef.current;
    if (player === null) {
      return;
    }
    const url = URL.createObjectURL(audio.blob);
    player.src = url;
    return () => {
      player.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [audio.blob]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Selected audio: ${audio.label}`}
      tabIndex={-1}
      className="space-y-3 rounded-xl border bg-card p-4 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="truncate font-medium">{audio.label}</p>
          <p className="font-mono text-sm text-muted-foreground tabular-nums">
            {formatDuration(audio.durationSec)} · {formatBytes(audio.blob.size)}
          </p>
        </div>
        <Button type="button" variant="ghost" className="h-9 px-3" onClick={onRemove}>
          Remove
        </Button>
      </div>
      {/* Captions for this audio are what the app goes on to produce: its transcript. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={playerRef} controls preload="metadata" className="w-full" />
      {audio.notice !== undefined && (
        <p className="text-sm text-muted-foreground">{audio.notice}</p>
      )}
    </div>
  );
}
