/**
 * Коды подтверждения из лога бэкенда: в режиме SMTP_LOG_ONLY письма не уходят, а бэкенд
 * пишет строку «[CODE] to=… purpose=<назначение> code=123456». Путь к логу — E2E_BACKEND_LOG
 * (в CI его задаёт .github/workflows/ci-cd.yml).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/** Назначения кодов — как в письмах и в логе бэкенда. */
export const CODE_PURPOSE = { register: 'регистрации', resetPassword: 'восстановления пароля' } as const;

const CODE_LINE = /\[CODE\] .*?purpose=(.+?) code=(\d{6})/g;

/** Путь к логу бэкенда или undefined, если он не задан. */
export function backendLogPath(): string | undefined {
  return process.env.E2E_BACKEND_LOG || undefined;
}

/** Отметка конца лога: коды ищутся только в строках, появившихся после неё. */
export function logMark(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

/**
 * POST к API кодов. Бэкенд выдаёт не больше 10 кодов в минуту на IP, а все сценарии ходят
 * с одного адреса: на 429 ждём Retry-After и повторяем.
 * @param request - HTTP-клиент Playwright
 * @param url - адрес API
 * @param data - тело запроса
 */
async function postCodeRequest(request: APIRequestContext, url: string, data: Record<string, string>): Promise<APIResponse> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await request.post(url, { data });
    if (res.status() !== 429 || attempt >= 3) return res;
    const seconds = Math.min(Math.max(Number(res.headers()['retry-after']) || 10, 1), 60);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}

/**
 * Дождаться кода с назначением purpose, появившегося в логе после отметки.
 * @param path - лог бэкенда
 * @param mark - отметка logMark, снятая до запроса кода
 * @param purpose - назначение кода из CODE_PURPOSE
 */
export async function waitForCode(path: string, mark: number, purpose: string): Promise<string> {
  let code = '';
  await expect
    .poll(
      () => {
        const fresh = readFileSync(path).subarray(mark).toString('utf8');
        code = [...fresh.matchAll(CODE_LINE)].filter((m) => m[1] === purpose).at(-1)?.[2] ?? '';
        return code;
      },
      { timeout: 20_000, message: `код «${purpose}» не появился в логе бэкенда` },
    )
    .not.toBe('');
  return code;
}

/**
 * Сменить пароль через «Забыли пароль?» по API (код — из лога): все сессии аккаунта,
 * открытые до этого, перестают действовать.
 * @param request - HTTP-клиент Playwright (baseURL — фронтенд, /api проксируется)
 * @param log - лог бэкенда
 * @param email - почта аккаунта
 * @param password - новый пароль
 */
export async function resetPassword(request: APIRequestContext, log: string, email: string, password: string): Promise<void> {
  const mark = logMark(log);
  const sent = await postCodeRequest(request, '/api/auth/password/send-code', { email });
  expect(sent.status(), await sent.text()).toBe(200);

  const code = await waitForCode(log, mark, CODE_PURPOSE.resetPassword);
  const reset = await postCodeRequest(request, '/api/auth/password/reset', { email, code, password });
  expect(reset.status(), await reset.text()).toBe(200);
}

/**
 * Зарегистрировать аккаунт через API (код — из лога) и вернуть токен его сессии.
 * @param request - HTTP-клиент Playwright (baseURL — фронтенд, /api проксируется)
 * @param log - лог бэкенда
 * @param email - почта нового аккаунта
 * @param password - пароль нового аккаунта
 */
export async function registerAccount(request: APIRequestContext, log: string, email: string, password: string): Promise<string> {
  const mark = logMark(log);
  const sent = await postCodeRequest(request, '/api/auth/send-code', { email, purpose: 'register', name: 'E2E', password });
  expect(sent.status(), await sent.text()).toBe(200);
  const { token } = (await sent.json()) as { token: string };

  const code = await waitForCode(log, mark, CODE_PURPOSE.register);
  const verified = await postCodeRequest(request, '/api/auth/verify-code', { email, code, purpose: 'register', token });
  expect(verified.status(), await verified.text()).toBe(200);
  return ((await verified.json()) as { token: string }).token;
}
