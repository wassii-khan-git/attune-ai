import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';
import { cn } from '@/lib/utils';
import { NONCE_HEADER } from '@/proxy';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Attune AI', template: '%s · Attune AI' },
  description:
    'A demo clinical scribe: record a short consultation and get an editable SOAP note. Demo only, for synthetic data. Not a medical device.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcfd' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the nonce makes every page render per request, which a nonce-based policy requires.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // next-themes sets the theme class before React hydrates, so the attribute differs by design.
    <html lang="en" className={cn(GeistSans.variable, GeistMono.variable)} suppressHydrationWarning>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
