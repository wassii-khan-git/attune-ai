'use client';

import { useState } from 'react';

import { useAuth } from './auth-provider';
import { welcomeFor } from './greeting';

/** The first thing on the signed-in home page: a greeting by name, and what to do next. */
export function Welcome() {
  const { state } = useAuth();
  // Read once, when the page opens. Rendering must not depend on the clock.
  const [openedAt] = useState(() => Date.now());

  if (state.status !== 'authenticated') {
    return null;
  }
  const { user } = state;

  return (
    <div className="min-w-0 space-y-1">
      <h1 className="text-2xl font-semibold wrap-break-word sm:text-3xl">
        {welcomeFor(user, openedAt)}
      </h1>
      <p className="text-muted-foreground">
        {user.isGuest
          ? 'Start a new visit and choose a sample to watch a note being written.'
          : 'Start a new visit, or pick up where you left off.'}
      </p>
    </div>
  );
}
