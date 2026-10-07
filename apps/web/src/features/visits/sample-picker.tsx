'use client';

import { useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/format';

import { SAMPLES, type Sample } from './samples';
import { audioFromSample, type SelectedAudio } from './selected-audio';

/** Offers the bundled sample consultations, for trying the app without a microphone. */
export function SamplePicker({ onSelected }: { onSelected: (audio: SelectedAudio) => void }) {
  const mounted = useRef(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const choose = (sample: Sample): void => {
    setError(null);
    setLoadingId(sample.id);
    void audioFromSample(sample).then((result) => {
      if (!mounted.current) {
        return;
      }
      setLoadingId(null);
      if (result.ok) {
        onSelected(result.audio);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {SAMPLES.map((sample) => (
          <li
            key={sample.id}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border p-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="font-medium">
                {sample.title}
                <span className="ml-2 font-mono text-sm font-normal text-muted-foreground tabular-nums">
                  {formatDuration(sample.durationSec)}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{sample.summary}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-3"
              disabled={loadingId !== null}
              aria-label={`Use the sample: ${sample.title}`}
              onClick={() => {
                choose(sample);
              }}
            >
              {loadingId === sample.id ? <Spinner /> : null}
              Use this sample
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        The samples are invented conversations, spoken by a speech synthesiser.
      </p>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
