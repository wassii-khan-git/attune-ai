import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type SettingsSectionProps = {
  /** For the heading, which names the section to assistive technology. */
  id: string;
  title: string;
  description: string;
  /** `danger` is for what cannot be undone. */
  tone?: 'default' | 'danger';
  children: ReactNode;
};

/**
 * One group of settings: what it is about on one side, its rows in a panel on
 * the other. On a narrow screen the panel goes under the heading.
 *
 * The danger panel has a border and no fill: the red button's hover tint is
 * only dark enough to read against the page's own background.
 */
export function SettingsSection({
  id,
  title,
  description,
  tone = 'default',
  children,
}: SettingsSectionProps) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-x-10 gap-y-4 md:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <div className="space-y-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          'divide-y rounded-xl border',
          tone === 'danger' ? 'border-destructive/30' : 'bg-card shadow-xs',
        )}
      >
        {children}
      </div>
    </section>
  );
}

type SettingsRowProps = {
  label: string;
  hint?: ReactNode;
  /** A small picture in front of the label, for rows that only inform. */
  icon?: ReactNode;
  /** The control or the value, on the far side of the row. */
  children?: ReactNode;
};

/** A line in a section: a name and a word about it, then its value or control. */
export function SettingsRow({ label, hint, icon, children }: SettingsRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
      {/* Wide enough to read, and willing to narrow so that a control fits beside it. */}
      <div className="flex min-w-0 flex-1 basis-72 items-start gap-3">
        {icon !== undefined && (
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{label}</p>
          {hint !== undefined && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
