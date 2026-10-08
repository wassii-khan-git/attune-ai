'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

const THEMES: readonly { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/**
 * Light, dark, or whatever the device is set to. The button in the header
 * switches between the first two; this is where "System" can be chosen again.
 */
export function ThemeSetting() {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset>
      <legend className="sr-only">Theme</legend>
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <label
            key={value}
            className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={theme === value}
              onChange={() => {
                setTheme(value);
              }}
              className="sr-only"
            />
            <Icon aria-hidden className="size-4" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
