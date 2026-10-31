import js from '@eslint/js';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      // iCloud: реальная папка зависимостей (node_modules — симлинк на неё).
      'node_modules.nosync',
      'backend',
      'public',
      // Авто-сгенерированный файл — не линтим.
      'src/features/furniture/modelList.ts',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      jsdoc,
    },
    settings: {
      jsdoc: { mode: 'typescript' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Кодовая база осознанно использует any в API-слое и сагах,
      // а также пустые reducer-функции как триггеры для saga.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // JSDoc не обязателен везде, но если он есть — должен быть корректным.
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-param-names': ['warn', { checkDestructured: false }],
      'jsdoc/check-tag-names': ['warn', { definedTags: ['module'] }],
      'jsdoc/no-multi-asterisks': 'warn',
      'jsdoc/require-param-name': 'warn',
      'jsdoc/require-returns-check': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // Тесты: разрешаем dev-хелперы.
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
