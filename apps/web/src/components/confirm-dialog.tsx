'use client';

import { Trash2 } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

import { Spinner } from '@/components/spinner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type ConfirmDialogProps = {
  open: boolean;
  /** What is about to happen, put as a question. */
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs. */
  busyLabel: string;
  busy: boolean;
  /** Why the action failed, if it did. */
  error?: string | null;
  /** Where the focus goes when the dialog closes. By default, back to where it came from. */
  finalFocus?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Asks before something is deleted, for a control that has no room to ask in
 * place, such as an icon in a list. "Cancel" comes first and takes the focus,
 * so a stray Enter backs out.
 *
 * The confirm button is solid red. The tinted red button used elsewhere is
 * too faint to read on a dialog's surface while it is hovered.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  busy,
  error = null,
  finalFocus,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent {...(finalFocus === undefined ? {} : { finalFocus })}>
        <AlertDialogHeader>
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive dark:bg-destructive/20"
          >
            <Trash2 className="size-5" />
          </span>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-11 px-5 text-base"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 bg-destructive px-5 text-base text-background hover:bg-destructive/90 focus-visible:border-destructive focus-visible:ring-destructive/30"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Spinner /> : null}
            {busy ? busyLabel : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
