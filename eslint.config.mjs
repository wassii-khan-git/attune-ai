import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/** Only repositories may import the database client, so queries cannot leak into other layers. */
const databaseAccess = {
  group: ['**/generated/prisma/**', '@prisma/*', 'pg'],
  message: 'Only files in src/repositories may talk to the database.',
};

function restrictImports(patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] };
}

/**
 * Enforces the API layering (routes -> controllers -> services -> repositories)
 * by banning imports that skip a layer or point back up the stack.
 */
function restrictLayer(layer, forbidden, message) {
  const layering = { group: forbidden.map((name) => `**/${name}/**`), message };
  return {
    files: [`apps/api/src/${layer}/**`],
    rules: restrictImports(layer === 'repositories' ? [layering] : [layering, databaseAccess]),
  };
}

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/src/generated/**',
  ]),

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Logs must go through the redacting logger so PHI cannot leak via console.
      'no-console': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/repositories/**'],
    rules: restrictImports([databaseAccess]),
  },
  restrictLayer(
    'routes',
    ['services', 'repositories'],
    'Routes only wire URLs to controllers; they must not reach into services or repositories.',
  ),
  restrictLayer(
    'controllers',
    ['routes', 'repositories'],
    'Controllers translate HTTP to service calls; data access belongs behind a service.',
  ),
  restrictLayer(
    'services',
    ['routes', 'controllers'],
    'Services hold business logic and must not depend on the HTTP layer.',
  ),
  restrictLayer(
    'repositories',
    ['routes', 'controllers', 'services'],
    'Repositories are the bottom layer and must not depend on the layers above.',
  ),

  prettier,
);
