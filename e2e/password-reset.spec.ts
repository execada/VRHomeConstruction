/**
 * «Забыли пароль?»: на своём новом аккаунте (регистрация через API) — код на почту
 * (из лога бэкенда), неверный код, верный код и новый пароль. После смены пароля прежняя
 * сессия и старый пароль не работают, вход с новым паролем — работает.
 * Нужен бэкенд в режиме SMTP_LOG_ONLY и путь к его логу в E2E_BACKEND_LOG.
 */
import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { backendLogPath, CODE_PURPOSE, logMark, registerAccount, waitForCode } from './support/backendLog';

const secret = () => randomBytes(9).toString('base64url');

test('забыли пароль: код из письма, новый пароль, прежние сессии закрыты', async ({ page, request }) => {
  // В CI страница рендерится медленно (без видеокарты) — запас по времени.
  test.slow();
  const log = backendLogPath();
  // Локально без лога сценарий пропускается, а в CI обязателен — иначе он молча не проверял бы ничего.
  test.skip(!log && !process.env.CI, 'Задайте E2E_BACKEND_LOG — путь к логу бэкенда в режиме SMTP_LOG_ONLY (см. e2e/README.md)');
  if (!log) throw new Error('E2E_BACKEND_LOG не задан — в CI он обязателен (.github/workflows/ci-cd.yml)');

  // Свой аккаунт: сброс пароля общего тестового аккаунта закрыл бы сессии остальных сценариев.
  const email = `e2e-reset-${Date.now()}@vrhome.test`;
  const oldPassword = `old-${secret()}`;
  const newPassword = `new-${secret()}`;
  const oldSession = await registerAccount(request, log, email, oldPassword);

  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Войти' }).click();
  const login = page.getByRole('dialog', { name: 'Вход' });
  await login.getByLabel('Почта или логин').fill(email);
  await login.getByRole('button', { name: 'Забыли пароль?' }).click();

  const reset = page.getByRole('dialog', { name: 'Восстановление пароля' });
  await expect(reset.getByLabel('Почта')).toHaveValue(email);
  const mark = logMark(log);
  await reset.getByRole('button', { name: 'Получить код' }).click();
  await expect(reset.getByRole('status')).toContainText('Если аккаунт с этой почтой есть');
  const code = await waitForCode(log, mark, CODE_PURPOSE.resetPassword);

  await reset.getByLabel('Код из письма').fill(code === '000000' ? '111111' : '000000');
  await reset.getByLabel('Новый пароль').fill(newPassword);
  await reset.getByLabel('Повторите пароль').fill(newPassword);
  await reset.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(reset.getByRole('alert')).toHaveText('Неверный код подтверждения');

  await reset.getByLabel('Код из письма').fill(code);
  await reset.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(login.getByRole('status')).toHaveText('Пароль изменён. Войдите с новым паролем.');
  await expect(login.getByLabel('Почта или логин')).toHaveValue(email);

  const me = await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${oldSession}` } });
  expect(me.status(), 'сессия, открытая до смены пароля, закрыта').toBe(401);
  const oldLogin = await request.post('/api/auth/login', { data: { email, password: oldPassword } });
  expect(oldLogin.status(), 'старый пароль больше не подходит').toBe(401);

  await login.getByLabel('Пароль', { exact: true }).fill(newPassword);
  await login.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Профиль и настройки' })).toBeVisible();
  await expect(login).toBeHidden();
});
