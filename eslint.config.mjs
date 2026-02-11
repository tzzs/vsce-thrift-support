// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['out', 'dist', '**/*.d.ts', 'node_modules'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Browser/VS Code globals
        TextDecoder: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        global: 'readonly',
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      // Custom rules from original .eslintrc.json
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'variableLike',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
        },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
      curly: 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
