import { parseCookie } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';

export const ACCESS_COOKIE = 'attune_access';
export const REFRESH_COOKIE = 'attune_refresh';

/** The refresh token is only ever needed by the auth endpoints, so the browser sends it nowhere else. */
const REFRESH_COOKIE_PATH = '/v1/auth';

export type SessionTokens = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type SessionCookies = {
  set: (res: Response, tokens: SessionTokens) => void;
  clear: (res: Response) => void;
  read: (req: Request) => { accessToken?: string; refreshToken?: string };
};

/**
 * Session cookies for browsers.
 * - `httpOnly`: page scripts cannot read the tokens, so XSS cannot steal them.
 * - `sameSite: 'lax'`: the browser leaves them off cross-site POST, PATCH and DELETE requests.
 * - No `Domain`: they belong to the exact host that set them.
 * - `secure` is on everywhere except local development over plain HTTP.
 * - Lifetime is sent as `Max-Age`, a duration, so a wrong clock on the device cannot
 *   expire a session early or keep it alive too long.
 */
export function createSessionCookies({
  secure,
  now,
}: {
  secure: boolean;
  now: () => Date;
}): SessionCookies {
  const base: CookieOptions = { httpOnly: true, secure, sameSite: 'lax' };
  const accessOptions: CookieOptions = { ...base, path: '/' };
  const refreshOptions: CookieOptions = { ...base, path: REFRESH_COOKIE_PATH };

  return {
    set: (res, tokens) => {
      const remainingMs = (expiresAt: Date): number =>
        Math.max(0, expiresAt.getTime() - now().getTime());

      res.cookie(ACCESS_COOKIE, tokens.accessToken, {
        ...accessOptions,
        maxAge: remainingMs(tokens.accessTokenExpiresAt),
      });
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
        ...refreshOptions,
        maxAge: remainingMs(tokens.refreshTokenExpiresAt),
      });
    },

    clear: (res) => {
      res.clearCookie(ACCESS_COOKIE, accessOptions);
      res.clearCookie(REFRESH_COOKIE, refreshOptions);
    },

    read: (req) => {
      const cookies = parseCookie(req.headers.cookie ?? '');
      const accessToken = cookies[ACCESS_COOKIE];
      const refreshToken = cookies[REFRESH_COOKIE];
      return {
        ...(accessToken === undefined ? {} : { accessToken }),
        ...(refreshToken === undefined ? {} : { refreshToken }),
      };
    },
  };
}
