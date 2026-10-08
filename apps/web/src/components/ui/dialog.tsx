'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';

/** Something to read or do over the page. It closes on Escape, on its close button and on a click outside it. */
function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

/** The popup scrolls as a whole when its content is taller than the screen; its header stays in view. */
function DialogContent({ className, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 z-50 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs print:hidden"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'scrollbar-on-hover fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-card text-card-foreground shadow-xl ring-1 ring-foreground/10 transition duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 print:hidden',
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

/** The title and description on one side, the close button on the other. */
function DialogHeader({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card px-6 py-4',
        className,
      )}
      {...props}
    >
      <div className="grid gap-1">{children}</div>
      <DialogPrimitive.Close
        render={<Button type="button" variant="ghost" size="icon-lg" className="-mr-2" />}
        aria-label="Close"
      >
        <X aria-hidden />
      </DialogPrimitive.Close>
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading text-lg leading-snug font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-body" className={cn('px-6 py-5', className)} {...props} />;
}

export { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle };
