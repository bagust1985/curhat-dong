import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Single ESLint config for the whole workspace (E01-T02).
 *
 * apps/mobile may layer its own overrides on top (TECH-SPEC §1.2) but must not
 * fork this base — the rules below encode project-wide non-negotiables.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/.expo/**',
      'packages/database/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // CLAUDE.md konvensi: no implicit/explicit `any` slipping through.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    // Non-negotiable #6: no floating versions reach production.
    // Non-negotiable #4: server secrets never cross into client bundles.
    files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@curhat/config/env/server'],
              message:
                'Server env must never be imported from a Next.js client bundle. Use @curhat/config/env/client.',
            },
          ],
        },
      ],
    },
  },

  {
    // NestJS resolves constructor injection from `design:paramtypes` metadata,
    // which only exists for *value* imports. Rewriting an injected class to
    // `import type` erases it and the provider silently fails to resolve at
    // runtime — a failure the type checker cannot see. The rule is off here
    // rather than worked around case by case.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
);
