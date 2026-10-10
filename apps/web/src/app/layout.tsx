import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { Providers } from '@/components/providers';
import { loadServerEnv } from '@/lib/server-env';
import { NONCE_HEADER } from '@/proxy';

import './globals.css';

const SITE_NAME = 'Attune AI';
const DESCRIPTION =
  'A demo clinical scribe: record a short consultation and get an editable SOAP note. Demo only, for synthetic data. Not a medical device.';

export const metadata: Metadata = {
  // The services that build a link preview need absolute addresses. The page's own
  // address below and its image (`opengraph-image.tsx`) are resolved against this one.
  metadataBase: new URL(loadServerEnv().SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  openGraph: {
    title: SITE_NAME,
    description: DESCRIPTION,
    type: 'website',
    siteName: SITE_NAME,
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfe' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0f15' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the nonce makes every page render per request, which a nonce-based policy requires.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    // next-themes sets the theme class before React hydrates, so the attribute differs by design.
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
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
