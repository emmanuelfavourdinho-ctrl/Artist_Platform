// Explainer: ESLint 9 changed how its configuration file works — the
// old .eslintrc.json format (still present in this repo, one level up)
// is no longer read automatically. This file is the modern replacement,
// written to enforce the exact same rules as the existing .eslintrc.json
// files, just in the format ESLint 9 actually understands. Nothing
// about the RULES changed here, only the file format they're written in.
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Turn off the base no-unused-vars in favor of the TypeScript-aware
      // version above — running both at once causes false-positive
      // duplicate warnings on the same line.
      'no-unused-vars': 'off',
    },
  },
  prettier,
];
