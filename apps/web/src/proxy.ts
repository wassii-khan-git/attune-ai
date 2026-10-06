import { NextResponse, type NextRequest } from 'next/server';

import { buildApiRequestHeaders } from '@/lib/security/api-forwarding';
import { buildContentSecurityPolicy, buildSecurityHeaders } from '@/lib/security/csp';
import { loadServerEnv } from '@/lib/server-env';

/** Carries the nonce to the server components that render this request. */
export const NONCE_HEADER = 'x-nonce';

const API_PREFIX = '/v1/';
const env = loadServerEnv();

/**
 * Passes a browser's API call on to the API, at the same path.
 *
 * The browser only ever talks to this site, so the API's cookies are
 * first-party cookies of this origin: SameSite works, no cross-origin request
 * is needed, and the content security policy can limit connections to 'self'.
 */
function forwardToApi(request: NextRequest): NextResponse {
  const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, env.API_URL);
  return NextResponse.rewrite(target, {
    request: { headers: buildApiRequestHeaders(request.headers, env.WEB_PROXY_SECRET) },
  });
}

/**
 * Serves a page with a fresh nonce. The content security policy goes on the
 * request, where Next.js reads the nonce for its own scripts, and on the
 * response, where the browser enforces it.
 */
function servePage(request: NextRequest): NextResponse {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const nonce = btoa(crypto.randomUUID());
  const contentSecurityPolicy = buildContentSecurityPolicy({ nonce, isDevelopment });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  for (const [name, value] of Object.entries(buildSecurityHeaders({ isDevelopment }))) {
    response.headers.set(name, value);
  }
  return response;
}

/** Runs before every request that is not a static asset. */
export function proxy(request: NextRequest): NextResponse {
  return request.nextUrl.pathname.startsWith(API_PREFIX)
    ? forwardToApi(request)
    : servePage(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
