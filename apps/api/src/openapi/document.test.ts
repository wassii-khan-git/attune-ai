import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createTestApp } from '../testing/test-app.js';
import { buildOpenApiDocument, OPERATIONS } from './document.js';

type OperationObject = {
  parameters?: { name: string; in: string; required: boolean }[];
  requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
  responses: Record<string, unknown>;
  security: unknown[];
};
type Document = {
  openapi: string;
  paths: Record<string, Record<string, OperationObject>>;
  components: { schemas: Record<string, unknown> };
};

const document = buildOpenApiDocument() as Document;
const PLACEHOLDER_ID = '0199a8f2-0000-7000-8000-000000000001';

describe('OpenAPI document', () => {
  it('is an OpenAPI 3.1 document with every operation listed once', () => {
    const listed = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method} ${path}`),
    );

    expect(document.openapi).toBe('3.1.0');
    expect(listed).toHaveLength(OPERATIONS.length);
    expect(new Set(listed).size).toBe(OPERATIONS.length);
  });

  it.each(OPERATIONS.map((operation) => [operation.method, operation.path] as const))(
    'describes %s %s, which is a route the app really serves',
    async (method, path) => {
      const { app } = createTestApp();

      const response = await request(app)[method](path.replace('{id}', PLACEHOLDER_ID));

      // Without a session or a body most routes refuse the call, but none may be missing.
      expect(response.status).not.toBe(404);
      expect(response.status).toBeLessThan(500);
    },
  );

  it('takes request shapes from the shared schemas', () => {
    const register = document.paths['/v1/auth/register']?.post;
    const schema = register?.requestBody?.content['application/json']?.schema;

    expect(schema).toMatchObject({
      type: 'object',
      required: ['email', 'password'],
      properties: { password: { type: 'string', minLength: 10, maxLength: 72 } },
    });
  });

  it('marks protected operations and gives them a 401 response', () => {
    const me = document.paths['/v1/auth/me']?.get;
    const login = document.paths['/v1/auth/login']?.post;

    expect(me?.security).toEqual([{ bearerAuth: [] }, { cookieAuth: [] }]);
    expect(me?.responses).toHaveProperty('401');
    expect(login?.security).toEqual([]);
  });

  it('documents path and query parameters', () => {
    const list = document.paths['/v1/visits']?.get;
    const get = document.paths['/v1/visits/{id}']?.get;

    expect(get?.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
    expect(list?.parameters?.map((parameter) => [parameter.name, parameter.required])).toEqual([
      ['q', false],
      ['cursor', false],
      ['limit', false],
    ]);
  });

  it('describes the upload as multipart and its answer as a stream of events', () => {
    const process = document.paths['/v1/visits/{id}/process']?.post;

    expect(process?.requestBody?.content).toHaveProperty('multipart/form-data');
    expect(process?.responses['200']).toMatchObject({
      content: { 'application/x-ndjson': { schema: expect.any(Object) as unknown } },
    });
  });

  it('does not describe the internal scheduler endpoint', () => {
    expect(JSON.stringify(document)).not.toContain('/internal');
  });

  it('never claims HIPAA compliance', () => {
    expect(JSON.stringify(document)).not.toMatch(/HIPAA[- ]compliant|compliant with HIPAA/i);
  });
});

describe('documentation routes', () => {
  it('serves the document as JSON', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ openapi: '3.1.0', info: { title: 'Attune AI API' } });
  });

  it('serves the viewer with pinned, integrity-checked assets and its own narrow policy', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/docs');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
    expect(response.text.match(/integrity="sha384-[A-Za-z0-9+/=]+"/g)).toHaveLength(2);
    expect(response.text).not.toMatch(/<script>(?!<)/);
    expect(response.headers['content-security-policy']).toContain(
      "script-src 'self' https://cdn.jsdelivr.net",
    );
    expect(response.headers['content-security-policy']).not.toContain("script-src 'unsafe-inline'");
  });

  it('keeps the deny-all policy on every other route', async () => {
    const { app } = createTestApp();

    const response = await request(app).get('/openapi.json');

    expect(response.headers['content-security-policy']).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
  });
});
