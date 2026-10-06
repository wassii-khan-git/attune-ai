'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/features/auth/auth-provider';

type ProvidersProps = {
  children: ReactNode;
  /** The content security policy nonce of this response, for the theme script. */
  nonce: string | undefined;
};

export function Providers({ children, nonce }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...(nonce === undefined ? {} : { nonce })}
    >
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
