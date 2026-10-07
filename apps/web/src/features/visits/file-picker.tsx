'use client';

import { MAX_AUDIO_BYTES, MAX_RECORDING_SEC } from '@attune/shared';
import { Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';

import { Spinner } from '@/components/spinner';
import { Button } from '@/components/ui/button';
import { AUDIO_ACCEPT, AUDIO_FORMATS } from '@/lib/audio/audio-file';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

import { audioFromFile, type SelectedAudio } from './selected-audio';

const LIMITS = `${AUDIO_FORMATS}. Up to ${formatBytes(MAX_AUDIO_BYTES)} and ${String(MAX_RECORDING_SEC / 60)} minutes.`;

/**
 * Takes an audio file by button or by drag and drop. The file is checked in
 * the browser (type, size, length) and stays there until the note is created.
 */
export function FilePicker({ onSelected }: { onSelected: (audio: SelectedAudio) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const take = (file: File | undefined): void => {
    if (file === undefined || checking) {
      return;
    }
    setError(null);
    setChecking(true);
    void audioFromFile(file).then((result) => {
      // The user may have switched to another way of adding audio in the meantime.
      if (!mounted.current) {
        return;
      }
      setChecking(false);
      if (result.ok) {
        onSelected(result.audio);
      } else {
        setError(result.message);
      }
    });
  };

  const handleDrag = (event: DragEvent, over: boolean): void => {
    event.preventDefault();
    setDragging(over);
  };

  return (
    <div
      onDragOver={(event) => {
        handleDrag(event, true);
      }}
      onDragLeave={(event) => {
        handleDrag(event, false);
      }}
      onDrop={(event) => {
        handleDrag(event, false);
        take(event.dataTransfer.files[0]);
      }}
      className={cn(
        'space-y-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
        dragging && 'border-primary bg-accent',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        aria-label="Audio file"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files?.[0]);
          // Lets the same file be chosen again after a correction.
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11 px-5 text-base"
        disabled={checking}
        onClick={() => inputRef.current?.click()}
      >
        {checking ? <Spinner /> : <Upload aria-hidden />}
        {checking ? 'Checking the file…' : 'Choose an audio file'}
      </Button>
      <p className="text-sm text-muted-foreground">or drop it here. {LIMITS}</p>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
