'use client';

import type { Transcript } from '@attune/shared';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { TranscriptView } from './transcript-view';

type TranscriptDialogProps = {
  open: boolean;
  transcript: Transcript;
  onClose: () => void;
};

/**
 * The conversation behind a note, opened over the page when it is asked for.
 * The note is what the page is for; the transcript is there to check it against.
 */
export function TranscriptDialog({ open, transcript, onClose }: TranscriptDialogProps) {
  const turns = transcript.length;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Transcript</DialogTitle>
          <DialogDescription>
            {turns === 1 ? '1 turn' : `${String(turns)} turns`}, transcribed by AI
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <TranscriptView transcript={transcript} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
