export type ContentSecurityPolicyOptions = {
  /** A fresh random value per response. Only scripts carrying it may run. */
  nonce: string;
  /** Development needs `eval` for React's fast refresh and a websocket for hot reloading. */
  isDevelopment: boolean;
};

/**
 * The content security policy for every page.
 *
 * Scripts are the part that matters most: nothing runs unless it carries this
 * response's nonce or was loaded by a script that does (`strict-dynamic`). An
 * injected `<script>` tag or inline handler is refused by the browser.
 *
 * Styles allow inline declarations, because the UI sets some as `style`
 * attributes (a waveform, a progress bar) and those cannot carry a nonce.
 * Inline styles cannot execute code, so the cost is small.
 *
 * `connect-src 'self'` is enough because the API is reached through this
 * site's own /v1 path.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
}: ContentSecurityPolicyOptions): string {
  const directives: [name: string, sources: string[]][] = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ],
    ],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    // Recordings are played back from in-memory blobs.
    ['media-src', ["'self'", 'blob:']],
    ['connect-src', ["'self'", ...(isDevelopment ? ['ws:'] : [])]],
    ['worker-src', ["'self'", 'blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ...(isDevelopment ? [] : ([['upgrade-insecure-requests', []]] as [string, string[]][])),
  ];

  return directives.map(([name, sources]) => [name, ...sources].join(' ')).join('; ');
}

/** Headers sent with every page, besides the content security policy. */
export function buildSecurityHeaders({ isDevelopment }: { isDevelopment: boolean }) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // The microphone is the only device feature the app uses, and only on this origin.
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
    // Browsers ignore this over plain http, which is what local development uses.
    ...(isDevelopment
      ? {}
      : { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' }),
  } satisfies Record<string, string>;
}
