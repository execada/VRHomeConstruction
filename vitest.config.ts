import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Юнит-тесты чистой логики (геометрия сцены, размещение мебели, солнце, миграции документа,
 * редьюсеры). Компоненты Three.js проверяются в браузере, а не здесь.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/lib/**/*.ts', 'src/shared/**/*.ts', 'src/features/**/slice.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/types.ts'],
      thresholds: { statements: 80, branches: 75, functions: 80, lines: 80 },
    },
  },
});
