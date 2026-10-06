import { CLIENT_ADDRESS_HEADER, PROXY_SECRET_HEADER } from '@attune/shared';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { clientAddress } from './client-address.js';

const SECRET = 'test-only-web-proxy-secret-0123456789abc';
const LOCAL = /^(::ffff:)?127\.0\.0\.1$|^::1$/;

function appWith(secret: string | undefined) {
  const app = express();
  app.use(clientAddress(secret));
  app.get('/', (req, res) => {
    res.json({ address: req.clientAddress });
  });
  return app;
}

async function addressSeen(secret: string | undefined, headers: Record<string, string>) {
  const response = await request(appWith(secret)).get('/').set(headers);
  return (response.body as { address: string }).address;
}

describe('clientAddress', () => {
  it('believes the forwarded address when the shared secret matches', async () => {
    const address = await addressSeen(SECRET, {
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_ADDRESS_HEADER]: '203.0.113.7',
    });

    expect(address).toBe('203.0.113.7');
  });

  it('accepts an IPv6 address', async () => {
    const address = await addressSeen(SECRET, {
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_ADDRESS_HEADER]: '2001:db8::1',
    });

    expect(address).toBe('2001:db8::1');
  });

  it.each([
    ['no secret', {}],
    ['a wrong secret', { [PROXY_SECRET_HEADER]: 'not-the-secret-not-the-secret-not-it' }],
    ['a prefix of the secret', { [PROXY_SECRET_HEADER]: SECRET.slice(0, -1) }],
  ])('falls back to the connection address for a request with %s', async (_label, headers) => {
    const address = await addressSeen(SECRET, {
      ...headers,
      [CLIENT_ADDRESS_HEADER]: '203.0.113.7',
    });

    expect(address).toMatch(LOCAL);
  });

  it('never believes the header when no secret is configured', async () => {
    const address = await addressSeen(undefined, {
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_ADDRESS_HEADER]: '203.0.113.7',
    });

    expect(address).toMatch(LOCAL);
  });

  it('ignores a forwarded value that is not an address', async () => {
    const address = await addressSeen(SECRET, {
      [PROXY_SECRET_HEADER]: SECRET,
      [CLIENT_ADDRESS_HEADER]: 'not-an-address; drop table',
    });

    expect(address).toMatch(LOCAL);
  });

  it('uses the connection address when the web app sent none', async () => {
    expect(await addressSeen(SECRET, { [PROXY_SECRET_HEADER]: SECRET })).toMatch(LOCAL);
  });
});
