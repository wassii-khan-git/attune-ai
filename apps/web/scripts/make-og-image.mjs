/**
 * Draws `src/app/opengraph-image.png`, the picture that LinkedIn, Slack, X and
 * the like show beside a link to the site, and writes its alt text next to it.
 *
 * The card is a small web page photographed in Chrome. It is built from the
 * app's own parts: the mark in `src/app/icon.svg`, the light theme's tokens in
 * `src/app/globals.css`, and the Geist font. Every word on it is written in
 * this file, so it holds no patient data, real or invented.
 *
 * The result is committed, not drawn on each build. Run this again after
 * changing the mark, the tokens or the wording, from `apps/web`:
 *
 *   node scripts/make-og-image.mjs
 *
 * It needs Chrome to be installed, as the browser tests do.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

const NAME = 'Attune AI';
const TAGLINE = ['AI clinical scribe:', 'from conversation to SOAP note'];
const LABEL = 'Demo, synthetic data only';

/** The size every large link preview is designed around. */
const WIDTH = 1200;
const HEIGHT = 630;

const appDir = join(import.meta.dirname, '../src/app');
const image = join(appDir, 'opengraph-image.png');
const altText = join(appDir, 'opengraph-image.alt.txt');

const mark = readFileSync(join(appDir, 'icon.svg'), 'utf8');
const font = readFileSync(
  join(import.meta.dirname, '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2'),
).toString('base64');

// The first `:root` block of the stylesheet holds the light theme.
const tokens = /:root \{[^}]*\}/.exec(readFileSync(join(appDir, 'globals.css'), 'utf8'))?.[0];
if (tokens === undefined) {
  throw new Error('The light theme tokens were not found in globals.css');
}

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      ${tokens}

      @font-face {
        font-family: Geist;
        font-weight: 100 900;
        src: url(data:font/woff2;base64,${font}) format('woff2');
      }

      * {
        box-sizing: border-box;
        margin: 0;
      }

      body {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-start;
        width: ${String(WIDTH)}px;
        height: ${String(HEIGHT)}px;
        padding: 80px;
        background:
          radial-gradient(circle at 100% 0%, var(--accent), transparent 62%), var(--background);
        color: var(--foreground);
        font-family: Geist, sans-serif;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 24px;
        font-size: 52px;
        font-weight: 600;
        letter-spacing: -0.025em;
      }

      .brand svg {
        width: 84px;
        height: 84px;
      }

      h1 {
        font-size: 68px;
        font-weight: 600;
        line-height: 1.12;
        letter-spacing: -0.03em;
        white-space: nowrap;
      }

      h1 span {
        display: block;
      }

      h1 span + span {
        color: var(--primary);
      }

      .label {
        width: fit-content;
        margin-top: 40px;
        padding: 12px 26px;
        border: 1px solid var(--border);
        border-radius: 9999px;
        background: var(--secondary);
        color: var(--secondary-foreground);
        font-size: 28px;
        font-weight: 500;
      }
    </style>
  </head>
  <body>
    <div class="brand">${mark}${NAME}</div>
    <div>
      <h1>${TAGLINE.map((line) => `<span>${line}</span>`).join('')}</h1>
      <p class="label">${LABEL}</p>
    </div>
  </body>
</html>`;

const browser = await chromium.launch({
  channel: 'chrome',
  // Greyscale smoothing and no hinting, so the letters come out the same on every system.
  args: ['--disable-lcd-text', '--font-render-hinting=none'],
});
try {
  const tab = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await tab.setContent(page);
  await tab.evaluate('document.fonts.ready');
  await tab.screenshot({ path: image });
} finally {
  await browser.close();
}

// No line break at the end: Next.js copies the file into the tag exactly as it is.
writeFileSync(altText, `${NAME}. ${TAGLINE.join(' ')}. ${LABEL}.`);

const kilobytes = Math.round(statSync(image).size / 1024);
console.log(`opengraph-image.png: ${String(WIDTH)} x ${String(HEIGHT)}, ${String(kilobytes)} KB`);
