import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

/**
 * Enforces the API layering (routes -> controllers -> services -> repositories)
 * by banning imports that skip a layer or point back up the stack.
 */
function restrictLayer(layer, forbidden, message) {
  return {
    files: [`apps/api/src/${layer}/**`],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: forbidden.map((name) => `**/${name}/**`), message }] },
      ],
    },
  };
}

export default defineConfig(
  globalIgnores(['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**']),

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
