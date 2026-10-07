'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/spinner';
import { Button } from '@/components/ui/button';

type ConfirmActionProps = {
  /** The button that starts it, such as "Delete visit". */
  label: string;
  /** What is about to happen, put as a question. */
  question: string;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs. */
  busyLabel: string;
  busy: boolean;
  /** Why the action failed, if it did. */
  error?: string | null;
  onConfirm: () => void;
};

/**
 * A destructive action that takes two deliberate clicks. The first only asks
 * the question; the focus then rests on "Cancel", so a stray Enter backs out.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  busyLabel,
  busy,
  error = null,
  onConfirm,
}: ConfirmActionProps) {
  const [asking, setAsking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (asking) {
      cancelRef.current?.focus();
    }
  }, [asking]);

  if (!asking) {
    return (
      <Button
        type="button"
        variant="destructive"
        className="h-10 px-4"
        onClick={() => {
          setAsking(true);
        }}
      >
        <Trash2 aria-hidden />
        {label}
      </Button>
    );
  }

  return (
    <div role="group" aria-label={label} className="space-y-3">
      <p className="font-medium">{question}</p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="destructive"
          className="h-10 px-4"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? <Spinner /> : null}
          {busy ? busyLabel : confirmLabel}
        </Button>
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          className="h-10 px-4"
          disabled={busy}
          onClick={() => {
            setAsking(false);
          }}
        >
          Cancel
        </Button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
