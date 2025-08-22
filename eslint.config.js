// eslint.config.js
import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    // Global ignores
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },

  // Standard ESLint and TypeScript ESLint recommended configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Configuration for the Prettier plugin
  {
    plugins: { prettier: prettierPlugin },
    rules: {
      // This rule runs Prettier and reports differences as ESLint errors.
      'prettier/prettier': [
        'warn', // Use 'warn' to not fail CI, or 'error' for strictness
        {
          // Your Prettier options go here
          semi: true,
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 120,
          tabWidth: 2,
        },
      ],
    },
  },

  // Configuration for import sorting (remains the same)
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
    },
  },

  // Main project configuration
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // No formatting rules here. Prettier plugin handles it all.
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
    },
  },

  // CRITICAL: This must still be the LAST entry.
  // It disables ESLint's own formatting rules that the Prettier plugin might have missed.
  prettierConfig,
];
