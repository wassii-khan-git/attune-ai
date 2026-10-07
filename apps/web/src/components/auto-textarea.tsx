'use client';

import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

type AutoTextareaProps = Omit<ComponentProps<'textarea'>, 'value'> & { value: string };

function fitToContent(element: HTMLTextAreaElement): void {
  const borders = element.offsetHeight - element.clientHeight;
  element.style.height = 'auto';
  element.style.height = `${String(element.scrollHeight + borders)}px`;
}

/**
 * A text area that is always as tall as its text, so a long section is read
 * and edited in the page itself and never inside a small scrolling box.
 */
export function AutoTextarea({ value, className, ...props }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current !== null) {
      fitToContent(ref.current);
    }
  }, [value]);

  // A narrower window wraps the text onto more lines.
  useEffect(() => {
    const refit = (): void => {
      if (ref.current !== null) {
        fitToContent(ref.current);
      }
    };
    window.addEventListener('resize', refit);
    return () => {
      window.removeEventListener('resize', refit);
    };
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={2}
      className={cn(
        'block w-full resize-none overflow-hidden rounded-lg border border-input bg-transparent px-3 py-2 text-base leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30',
        className,
      )}
      {...props}
    />
  );
}
