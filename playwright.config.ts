/**
 * E2E-тесты ключевых сценариев (Playwright + Chromium из `npx playwright install chromium`;
 * установленный Google Chrome — через E2E_CHANNEL=chrome).
 * Нужны запущенные бэкенд (порт 8080) и тестовый аккаунт в e2e/.env.e2e.local
 * (E2E_EMAIL, E2E_PASSWORD) — см. e2e/README.md. Дев-сервер поднимается сам, если не запущен.
 */
import { defineConfig } from '@playwright/test';
import { loadE2eEnv } from './e2e/support/env';

loadE2eEnv();

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const channel = process.env.E2E_CHANNEL || undefined;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/results',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  use: {
    baseURL,
    channel,
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // WebGL в безголовом браузере — через программный рендер SwiftShader.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'guest', testMatch: /guest\.spec\.ts/ },
    { name: 'app', testMatch: /(dashboard|editor|floors)\.spec\.ts/, dependencies: ['setup'], use: { storageState: 'e2e/.auth/user.json' } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
