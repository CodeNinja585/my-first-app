import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    plugins: {
      '@typescript-eslint': typescript,
      import: importPlugin,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/shared/**/*', 'apps/mobile/src/sync/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react-native', 'expo-*'],
              message: 'Do not import react-native or expo-* in shared/sync packages',
            },
          ],
        },
      ],
    },
  },
];
