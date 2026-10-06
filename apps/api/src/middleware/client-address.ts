import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

import { CLIENT_ADDRESS_HEADER, PROXY_SECRET_HEADER } from '@attune/shared';
import type { RequestHandler } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express exposes this namespace for augmentation
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging needs an interface
    interface Request {
      /** The network address of whoever made this request. Rate limits before sign-in count by it. */
      clientAddress: string;
    }
  }
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Works out who is calling.
 *
 * Browser traffic reaches the API through the web app, so the connection the
 * API sees belongs to the web app's host, not to the user. The web app passes
 * the user's address in a header. A header is only a claim, and anyone can
 * send one, so it is believed only when the request also carries the secret
 * the two apps share. Every other request, including one with a wrong secret,
 * is counted by the address of the connection itself.
 */
export function clientAddress(proxySecret: string | undefined): RequestHandler {
  const expected = proxySecret === undefined ? undefined : sha256(proxySecret);

  return (req, _res, next) => {
    const forwarded = req.get(CLIENT_ADDRESS_HEADER);
    const presented = req.get(PROXY_SECRET_HEADER);

    const isFromWebApp =
      expected !== undefined &&
      presented !== undefined &&
      // Hashed first so the comparison takes the same time whatever was sent.
      timingSafeEqual(sha256(presented), expected);

    req.clientAddress =
      isFromWebApp && forwarded !== undefined && isIP(forwarded) !== 0
        ? forwarded
        : (req.ip ?? 'unknown');
    next();
  };
}
