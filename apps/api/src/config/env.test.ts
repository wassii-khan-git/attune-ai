import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ConfigError, envSchema, loadConfig } from './env.js';

const validEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/attune',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-api-key',
  GEMINI_MODEL: 'test-model',
  ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
  CRON_SECRET: 'c'.repeat(32),
} satisfies NodeJS.ProcessEnv;

function problemsFor(env: NodeJS.ProcessEnv): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error.problems;
    }
    throw error;
  }
  throw new Error('Expected loadConfig to reject the environment');
}

describe('loadConfig', () => {
  it('returns the parsed config and fills in defaults', () => {
    const config = loadConfig(validEnv);

    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      GEMINI_MODEL: 'test-model',
      CORS_ALLOWED_ORIGINS: ['http://localhost:3000'],
    });
  });

  it('coerces PORT to a number', () => {
    expect(loadConfig({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
  });

  it('reports every missing variable in one error', () => {
    const problems = problemsFor({});

    expect(problems).toEqual(Object.keys(validEnv).map((name) => `${name}: Required`));
  });

  it('treats an empty value as invalid rather than falling back silently', () => {
    expect(problemsFor({ ...validEnv, JWT_ACCESS_SECRET: '' })).toHaveLength(1);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    const problems = problemsFor({
      ...validEnv,
      ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
    });

    expect(problems).toEqual(['ENCRYPTION_KEY: Must decode to exactly 32 bytes']);
  });

  it('rejects a database URL that is not PostgreSQL', () => {
    const problems = problemsFor({
      ...validEnv,
      DATABASE_URL: 'mysql://user:password@localhost/db',
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^DATABASE_URL:/);
  });

  it('splits CORS origins and normalises each to a bare origin', () => {
    const config = loadConfig({
      ...validEnv,
      CORS_ALLOWED_ORIGINS: 'https://app.example.com/, http://localhost:3000',
    });

    expect(config.CORS_ALLOWED_ORIGINS).toEqual([
      'https://app.example.com',
      'http://localhost:3000',
    ]);
  });

  it('rejects a CORS entry that is not an http(s) origin', () => {
    const problems = problemsFor({ ...validEnv, CORS_ALLOWED_ORIGINS: 'http://localhost:3000,*' });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^CORS_ALLOWED_ORIGINS\.1:/);
  });

  it('never echoes a rejected value, so secrets cannot reach boot logs', () => {
    const rejected = {
      DATABASE_URL: 'mysql://admin:hunter2-db-password@db.internal/attune',
      ENCRYPTION_KEY: 'not-base64-leaked-key!',
      JWT_ACCESS_SECRET: 'short-leaked-jwt',
      CRON_SECRET: 'short-leaked-cron',
    };

    const message = problemsFor({ ...validEnv, ...rejected }).join('\n');

    for (const value of Object.values(rejected)) {
      expect(message).not.toContain(value);
    }
    expect(message).not.toContain('hunter2');
  });
});

describe('.env.example', () => {
  // Read by the Prisma CLI for migrations, never by the running API.
  const cliOnlyVariables = ['DIRECT_URL'];

  it('documents exactly the variables the config schema reads', () => {
    const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);

    expect(documented.toSorted()).toEqual(
      [...Object.keys(envSchema.shape), ...cliOnlyVariables].toSorted(),
    );
  });
});
