import { readFileSync } from 'node:fs';

import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { vercelTypeCheck } from '../testing/vercel-type-check.js';

const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

/**
 * Two things Vercel's builder requires of this app. Neither is visible from
 * the code itself, and breaking either only shows up as a failed deployment,
 * so they are pinned here.
 */
describe('what the deployment platform requires', () => {
  it('finds the entry file by an import of express in its text', () => {
    // The pattern the builder (@vercel/express) applies to candidate entry files.
    const pattern = /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/;

    expect(read('../server.ts')).toMatch(pattern);
  });

  it('keeps strict mode only if tsconfig.json names "module" itself, not just through "extends"', () => {
    // The builder (@vercel/node) reads this file before following "extends". If it
    // finds no "module" here, it sets "strict": false for its own type check.
    const result = ts.readConfigFile('tsconfig.json', () => read('../../tsconfig.json'));
    const options = (result.config as { compilerOptions?: Record<string, unknown> } | undefined)
      ?.compilerOptions;

    expect(result.error).toBeUndefined();
    expect(options).toMatchObject({
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
    });
    expect(options).toHaveProperty('target');
  });
  it('passes the type check Vercel runs before deploying, which is not the same as tsc', () => {
    const apiDirectory = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

    expect(vercelTypeCheck(apiDirectory)).toEqual([]);
  }, 120_000);
});
