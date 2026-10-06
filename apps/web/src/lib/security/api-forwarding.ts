import { CLIENT_ADDRESS_HEADER, PROXY_SECRET_HEADER } from '@attune/shared';

/** Splits an `X-Forwarded-For` list and returns the first, client-most address. */
function firstForwardedAddress(value: string | null): string | undefined {
  const first = value?.split(',')[0]?.trim();
  return first === undefined || first === '' ? undefined : first;
}

/**
 * The headers to send to the API for a browser request this app forwards.
 *
 * Whatever the browser sent in the two trusted headers is removed first, so a
 * visitor cannot supply their own. If a shared secret is configured, the
 * browser's address, as the hosting platform reported it to this app, is
 * passed along with that secret. Everything else, including `Origin` and
 * cookies, goes through untouched: the API relies on both.
 */
export function buildApiRequestHeaders(
  incoming: Headers,
  proxySecret: string | undefined,
): Headers {
  const headers = new Headers(incoming);
  headers.delete(CLIENT_ADDRESS_HEADER);
  headers.delete(PROXY_SECRET_HEADER);

  if (proxySecret !== undefined) {
    headers.set(PROXY_SECRET_HEADER, proxySecret);
    // The platform sets these on the way in. `x-real-ip` is a single address;
    // `x-forwarded-for` is a list whose first entry is the client.
    const address =
      incoming.get('x-real-ip') ?? firstForwardedAddress(incoming.get('x-forwarded-for'));
    if (address !== undefined) {
      headers.set(CLIENT_ADDRESS_HEADER, address);
    }
  }
  return headers;
}
