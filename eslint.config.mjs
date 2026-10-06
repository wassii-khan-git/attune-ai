import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/** Only repositories may import the database client, so queries cannot leak into other layers. */
const databaseAccess = {
  group: ['**/generated/prisma/**', '@prisma/*', 'pg'],
  message: 'Only files in src/repositories may talk to the database.',
};

/** Only the adapter in src/ai may import the model SDK, so the provider can be swapped in one place. */
const modelSdkMessage =
  'Only files in src/ai may import the model SDK. Depend on ScribeModel instead.';
const modelSdkAccess = { group: ['@ai-sdk/*'], message: modelSdkMessage };
// Listed by exact name: as a pattern, "ai" would also match the local src/ai folder.
const modelSdkPackage = { name: 'ai', message: modelSdkMessage };

function restrictImports(patterns) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: patterns.filter((entry) => 'group' in entry),
        paths: patterns.filter((entry) => 'name' in entry),
      },
    ],
  };
}

/**
 * Enforces the API layering (routes -> controllers -> services -> repositories)
 * by banning imports that skip a layer or point back up the stack.
 */
function restrictLayer(layer, forbidden, message) {
  const layering = { group: forbidden.map((name) => `**/${name}/**`), message };
  return {
    files: [`apps/api/src/${layer}/**`],
    rules: restrictImports(
      layer === 'repositories'
        ? [layering, modelSdkAccess, modelSdkPackage]
        : [layering, databaseAccess, modelSdkAccess, modelSdkPackage],
    ),
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
      // Express recognises an error handler by its four parameters, used or not.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // A command-line report over synthetic data: printing to the terminal is its purpose.
    files: ['apps/api/eval/run.ts'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['apps/api/src/**'],
    ignores: ['apps/api/src/repositories/**', 'apps/api/src/ai/**'],
    rules: restrictImports([databaseAccess, modelSdkAccess, modelSdkPackage]),
  },
  {
    files: ['apps/api/src/ai/**'],
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
