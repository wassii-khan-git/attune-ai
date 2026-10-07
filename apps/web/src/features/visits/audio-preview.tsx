'use client';

import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { formatBytes, formatDuration } from '@/lib/format';

import type { SelectedAudio } from './selected-audio';

type AudioPreviewProps = {
  audio: SelectedAudio;
  onRemove: () => void;
};

/** Shows the audio that was chosen, with a player to check it before it is sent. */
export function AudioPreview({ audio, onRemove }: AudioPreviewProps) {
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
    <div className="space-y-3 rounded-xl border bg-card p-4">
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
