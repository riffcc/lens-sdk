// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    // Global ignores: Applied to all configurations
    ignores: [
        '**/dist/**',
        '**/node_modules/**', // Common practice to ignore node_modules globally
        '**/coverage/**',
        // 'vite.config.ts.timestamp-*.mjs', // REMOVE THIS LINE
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        // project: true, // If you want type-aware linting, uncomment and set path
        // tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
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
      semi: ['error', 'always'],
      'comma-dangle': ['warn', 'always-multiline'],
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