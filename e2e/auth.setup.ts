/**
 * Вход тестовым аккаунтом через интерфейс; сессия сохраняется для остальных сценариев.
 */
import { expect, test as setup } from '@playwright/test';
import { testAccount } from './support/env';

setup('вход по почте и паролю', async ({ page }) => {
  const { email, password } = testAccount();
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Войти' }).click();

  const dialog = page.getByRole('dialog', { name: 'Вход' });
  await dialog.getByLabel('Почта').fill(email);
  await dialog.getByLabel('Пароль').fill(password);
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Профиль и настройки' })).toBeVisible();
  await expect(dialog).toBeHidden();
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
