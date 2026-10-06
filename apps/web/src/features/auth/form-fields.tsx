'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TextFieldProps = Omit<ComponentProps<typeof Input>, 'id'> & {
  /** Also used as the input's id, so it must be unique on the page. */
  name: string;
  label: string;
  hint?: string;
  error?: string | undefined;
};

/**
 * A labelled input with an optional hint and error. The error is tied to the
 * input for screen readers, and the input is marked invalid while it shows.
 */
export function TextField({ name, label, hint, error, className, ...input }: TextFieldProps) {
  const hintId = hint === undefined ? undefined : `${name}-hint`;
  const errorId = error === undefined ? undefined : `${name}-error`;
  const describedBy = [errorId, hintId].filter((id) => id !== undefined).join(' ');

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={error !== undefined}
        {...(describedBy === '' ? {} : { 'aria-describedby': describedBy })}
        className={`h-10 text-base ${className ?? ''}`}
        {...input}
      />
      {hint !== undefined && error === undefined && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** A password input with a button to show what was typed, which catches typos without a second field. */
export function PasswordField(props: Omit<TextFieldProps, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <TextField {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => {
          setVisible((current) => !current);
        }}
        className="absolute top-[1.9rem] right-1 flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? (
          <EyeOff aria-hidden className="size-4" />
        ) : (
          <Eye aria-hidden className="size-4" />
        )}
      </button>
    </div>
  );
}
