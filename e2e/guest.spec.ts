/**
 * Сценарии без входа: приглашение на главной, окно входа/регистрации,
 * шаблоны доступны для просмотра, старые адреса, страница 404.
 */
import { expect, test } from '@playwright/test';

test('главная приглашает войти и открывает регистрацию', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Проектируйте интерьер в 3D и VR' })).toBeVisible();

  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  const dialog = page.getByRole('dialog', { name: 'Регистрация' });
  await expect(dialog.getByLabel('Имя')).toBeFocused();
  await expect(dialog.getByLabel('Почта')).toBeVisible();

  await dialog.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('dialog', { name: 'Вход' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('неверный пароль — понятная ошибка по-русски', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('button', { name: 'Войти' }).click();
  const dialog = page.getByRole('dialog', { name: 'Вход' });
  // Каждый прогон — новый адрес: сервер блокирует адрес после 10 неудачных входов за 15 минут.
  await dialog.getByLabel('Почта').fill(`nobody-${Date.now()}@vrhome.test`);
  await dialog.getByLabel('Пароль').fill('wrong-password');
  await dialog.getByLabel('Пароль').press('Enter');
  await expect(dialog.getByRole('alert')).toHaveText(/Неверная почта или пароль|Пользователь не найден/);
});

test('шаблоны видны без входа, а создание проекта просит войти', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Шаблоны' })).toBeVisible();
  const builtins = page.getByRole('region', { name: 'Встроенные' });
  await expect(builtins.getByRole('button', { name: /Создать проект из шаблона/ })).toHaveCount(5);

  await page.getByRole('searchbox', { name: 'Поиск' }).fill('кровать');
  await expect(builtins.getByRole('button', { name: /Создать проект из шаблона/ })).toHaveCount(1);

  await builtins.getByRole('button', { name: 'Создать проект из шаблона «Спальня»' }).click();
  await expect(page.getByRole('dialog', { name: 'Вход' })).toBeVisible();
});

test('старые адреса и страница 404', async ({ page }) => {
  await page.goto('/layouts');
  await expect(page).toHaveURL(/\/templates$/);
  await page.goto('/packages');
  await expect(page).toHaveURL(/\/\?tab=folders$/);
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  await page.getByRole('button', { name: 'К моим проектам' }).click();
  await expect(page).toHaveURL(/\/$/);
});
