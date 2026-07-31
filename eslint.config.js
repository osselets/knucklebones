import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import importPlugin from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/vite-env.d.ts',
      'apps/front/vite.config.ts'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker
      }
    },
    plugins: {
      'import-x': importPlugin,
      'react-hooks': reactHooks
    },
    settings: {
      'import-x/external-module-folders': [
        'node_modules',
        'apps/front/node_modules',
        'apps/worker/node_modules'
      ],
      'import-x/internal-regex': '^@knucklebones/'
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index'
          ],
          alphabetize: {
            order: 'asc'
          },
          pathGroups: [
            {
              pattern: 'react*',
              group: 'external',
              position: 'before'
            },
            {
              pattern: '@**/*',
              group: 'external',
              position: 'after'
            }
          ],
          pathGroupsExcludedImportTypes: []
        }
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/method-signature-style': ['error', 'method'],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off'
    }
  },
  prettier
)
