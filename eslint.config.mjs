// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Shared rule set applied to all packages. */
const sharedRules = {
  '@typescript-eslint/naming-convention': [
    'warn',
    {
      selector: 'variableLike',
      format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
    },
    {
      // Allow `_` prefix for unused parameters
      selector: 'parameter',
      format: ['camelCase', 'PascalCase'],
      leadingUnderscore: 'allow',
      filter: { regex: '^_', match: true },
    },
  ],
  eqeqeq: ['error', 'always'],
  curly: 'warn',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-floating-promises': ['error', {ignoreVoid: true}],
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'warn',
  '@typescript-eslint/ban-ts-comment': 'error',
  '@typescript-eslint/strict-boolean-expressions': 'warn',
  'no-console': 'error',
};

/** Node.js globals shared by core and cli (no vscode). */
const nodeGlobals = {
  process: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  console: 'readonly',
  global: 'readonly',
  NodeJS: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

export default [
  {
    ignores: [
      'out/**',
      'dist/**',
      '**/*.d.ts',
      '**/*.js',
      'node_modules/**',
      'packages/*/out/**',
      'packages/*/dist/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  // VS Code extension package (type-aware linting)
  {
    files: ['packages/vscode/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...nodeGlobals,
        TextDecoder: 'readonly',
        performance: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.reduce(
        (acc, cfg) => ({...acc, ...(cfg.rules ?? {})}),
        {}
      ),
      ...sharedRules,
    },
  },
  // Core package (zero vscode dependency, type-aware linting)
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './packages/core/tsconfig.json',
        sourceType: 'module',
      },
      globals: nodeGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.reduce(
        (acc, cfg) => ({...acc, ...(cfg.rules ?? {})}),
        {}
      ),
      ...sharedRules,
      // Allow console in core (no vscode.window available)
      'no-console': 'warn',
    },
  },
  // CLI package (type-aware linting)
  {
    files: ['packages/cli/src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './packages/cli/tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...nodeGlobals,
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.reduce(
        (acc, cfg) => ({...acc, ...(cfg.rules ?? {})}),
        {}
      ),
      ...sharedRules,
      // CLI writes to stdout/stderr by design
      'no-console': 'off',
    },
  },
];
