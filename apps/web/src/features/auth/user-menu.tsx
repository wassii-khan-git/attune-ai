'use client';

import { Button } from '@/components/ui/button';
import { useConfirmLeave } from '@/lib/navigation-guard';

import { useAuth } from './auth-provider';

/** Who is signed in, and a way to sign out. */
export function UserMenu() {
  const { state, logout } = useAuth();
  const confirmLeave = useConfirmLeave();
  if (state.status !== 'authenticated') {
    return null;
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-56 truncate text-sm text-muted-foreground sm:inline">
        {state.user.isGuest ? 'Guest' : state.user.email}
      </span>
      <Button
        variant="outline"
        size="lg"
        onClick={() => {
          if (confirmLeave()) {
            void logout();
          }
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
