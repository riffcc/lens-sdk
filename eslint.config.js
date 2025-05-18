import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

import globals from 'globals';

export default [
  {
    ignores: ['**/dist/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        parser: '@typescript-eslint/parser',
      },
    },
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      /**
       * Having a semicolon helps the optimizer interpret your code correctly.
       * This avoids rare errors in optimized code.
       * @see https://twitter.com/alex_kozack/status/1364210394328408066
       */
      semi: ['error', 'always'],
      /**
       * This will make the history of changes in the hit a little cleaner
       */
      'comma-dangle': ['warn', 'always-multiline'],
      /**
       * Just for beauty
       */
      quotes: [
        'warn',
        'single',
        {
          avoidEscape: true,
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        parser: '@typescript-eslint/parser',
      },
      globals: {
        ...globals.node,
      },
    },
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      /**
       * Having a semicolon helps the optimizer interpret your code correctly.
       * This avoids rare errors in optimized code.
       * @see https://twitter.com/alex_kozack/status/1364210394328408066
       */
      semi: ['error', 'always'],
      /**
       * This will make the history of changes in the hit a little cleaner
       */
      'comma-dangle': ['warn', 'always-multiline'],
      /**
       * Just for beauty
       */
      quotes: [
        'warn',
        'single',
        {
          avoidEscape: true,
        },
      ],
    },
  },
];
