/**
 * Загрузка локальных переменных E2E (тестовый аккаунт) из e2e/.env.e2e.local.
 * Уже заданные переменные окружения не перезаписываются (удобно для CI).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadE2eEnv(file = resolve(process.cwd(), 'e2e/.env.e2e.local')): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith('#')) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

/** Тестовый аккаунт; без него сценарии с входом не запускаются. */
export function testAccount(): { email: string; password: string } {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error('Задайте E2E_EMAIL и E2E_PASSWORD (e2e/.env.e2e.local, см. e2e/README.md)');
  return { email, password };
}
