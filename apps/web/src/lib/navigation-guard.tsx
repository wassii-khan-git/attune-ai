'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
} from 'react';

type NavigationGuard = {
  /** Sets, or with null clears, the question to ask before the page is left. */
  setWarning: (message: string | null) => void;
  /** True if the page may be left: nothing is at stake, or the user said yes. */
  confirmLeave: () => boolean;
};

const NavigationGuardContext = createContext<NavigationGuard | null>(null);

/**
 * Lets a page say "leaving now would lose something", and lets links ask
 * before they navigate.
 *
 * The browser only warns about a reload or a closed tab. A click on a link
 * inside the app replaces the page without a word, which is how a recording
 * that was never uploaded would be lost. Links made with `GuardedLink` ask
 * first. The browser's own back button is not covered.
 */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const warning = useRef<string | null>(null);

  const guard = useMemo<NavigationGuard>(
    () => ({
      setWarning: (message) => {
        warning.current = message;
      },
      confirmLeave: () => warning.current === null || window.confirm(warning.current),
    }),
    [],
  );

  return <NavigationGuardContext value={guard}>{children}</NavigationGuardContext>;
}

function useNavigationGuard(): NavigationGuard {
  const guard = useContext(NavigationGuardContext);
  if (guard === null) {
    throw new Error('The navigation guard must be used inside <NavigationGuardProvider>');
  }
  return guard;
}

/** While `message` is not null, leaving this page by a guarded link asks the user first. */
export function useLeaveWarning(message: string | null): void {
  const { setWarning } = useNavigationGuard();
  useEffect(() => {
    setWarning(message);
    return () => {
      setWarning(null);
    };
  }, [setWarning, message]);
}

/** For actions other than links that leave the page, such as signing out. */
export function useConfirmLeave(): () => boolean {
  return useNavigationGuard().confirmLeave;
}

/** A link that first asks, if the current page has said that leaving would lose something. */
export function GuardedLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  const { confirmLeave } = useNavigationGuard();
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        if (confirmLeave()) {
          onNavigate?.(event);
        } else {
          event.preventDefault();
        }
      }}
    />
  );
}
