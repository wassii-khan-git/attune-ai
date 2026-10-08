'use client';

import { ShieldCheck } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type ConsentDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Asks whether everyone in the conversation has agreed, at the moment it
 * matters: before the microphone starts, or before a file or a sample is sent.
 *
 * "Cancel" comes first and takes the focus, so a stray Enter backs out and
 * never confirms consent on someone's behalf.
 */
export function ConsentDialog({ open, onConfirm, onCancel }: ConsentDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <ShieldCheck className="size-5" />
          </span>
          <AlertDialogTitle>Has everyone agreed?</AlertDialogTitle>
          <AlertDialogDescription>
            Confirm that everyone in this conversation has agreed to it being recorded and
            transcribed by AI. The time of this confirmation is saved with the visit. Without it, no
            recording is made and no note is generated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-5 text-base"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="button" className="h-11 px-5 text-base" onClick={onConfirm}>
            Yes, everyone has agreed
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
