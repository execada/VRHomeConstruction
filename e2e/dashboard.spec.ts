/**
 * Главная после входа: проект из шаблона, избранное, теги и поиск, папки, удаление.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, useLowGraphics, waitForScene } from './support/app';

/** Переименовать проект через API: у каждого прогона своё уникальное имя. */
async function renameProject(page: Page, id: string, name: string): Promise<void> {
  const status = await page.evaluate(
    async ([projectId, projectName]) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify({ name: projectName }),
      });
      return res.status;
    },
    [id, name] as const,
  );
  expect(status).toBe(200);
}

const card = (page: Page, name: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });

test('проект из шаблона: избранное, теги, поиск, папка и удаление', async ({ page }) => {
  const name = `E2E Кабинет ${Date.now()}`;
  const folderName = `E2E папка ${Date.now()}`;
  await useLowGraphics(page);
  await page.goto('/');

  // У пустого аккаунта (как в CI) есть ещё кнопка в пустом состоянии — берём кнопку «+» в шапке вкладок.
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Готовый макет/ }).click();
  await page.getByRole('dialog', { name: 'Готовые макеты' }).getByRole('button', { name: 'Создать проект из шаблона «Кабинет»' }).click();
  await waitForScene(page);
  const id = projectIdFromUrl(page);

  try {
    await renameProject(page, id, name);
    await page.goto('/');
    const project = card(page, name);
    await expect(project).toBeVisible();

    // Избранное
    await project.getByRole('button', { name: 'Добавить в избранное' }).click();
    await expect(project.getByRole('button', { name: 'Убрать из избранного' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('tab', { name: 'Избранное' }).click();
    await expect(card(page, name)).toBeVisible();
    await page.getByRole('tab', { name: 'Все' }).click();

    // Описание и теги
    await card(page, name).getByRole('button', { name: 'Изменить название и описание' }).click();
    const edit = page.getByRole('dialog', { name: 'Проект' });
    await edit.getByLabel('Теги').fill('e2e-тест, Кабинет, e2e-тест');
    await edit.getByRole('button', { name: 'Сохранить' }).click();
    await expect(edit).toBeHidden();
    await expect(card(page, name)).toContainText('#e2e-тест #Кабинет');

    // Поиск по тегу и пустой результат
    const search = page.getByRole('searchbox', { name: 'Поиск' });
    await search.fill('E2E-ТЕСТ');
    await expect(card(page, name)).toBeVisible();
    await search.fill('нет-такого-проекта-123');
    await expect(page.getByRole('heading', { name: 'Ничего не найдено' })).toBeVisible();
    await search.fill('');

    // Папка: создать и положить туда проект
    await page.getByRole('tab', { name: 'Папки' }).click();
    await page.getByRole('button', { name: 'Новая папка' }).first().click();
    const create = page.getByRole('dialog', { name: 'Новая папка' });
    await create.getByLabel('Название папки').fill(folderName);
    await create.getByRole('button', { name: 'Создать папку' }).click();
    await expect(page.getByRole('heading', { name: folderName })).toBeVisible();

    await page.getByRole('tab', { name: 'Все' }).click();
    await card(page, name).getByRole('button', { name: 'Действия с проектом' }).click();
    await page.getByRole('menuitem', { name: 'В папку…' }).click();
    const move = page.getByRole('dialog', { name: `«${name}» в папки` });
    await move.getByRole('checkbox', { name: new RegExp(folderName) }).check();
    await move.getByRole('button', { name: 'Готово' }).click();

    await page.getByRole('tab', { name: 'Папки' }).click();
    await page.getByRole('button', { name: `Открыть папку «${folderName}»` }).click();
    await expect(card(page, name)).toBeVisible();
    await page.getByRole('button', { name: 'Все папки' }).click();

    // Удалить папку (проект остаётся)
    const folder = page.getByRole('article').filter({ has: page.getByRole('heading', { name: folderName }) });
    await folder.getByRole('button', { name: 'Действия с папкой' }).click();
    await page.getByRole('menuitem', { name: 'Удалить папку' }).click();
    await page.getByRole('dialog', { name: 'Удалить папку?' }).getByRole('button', { name: 'Удалить' }).click();
    await expect(page.getByRole('heading', { name: folderName })).toHaveCount(0);

    // Удалить проект через меню с подтверждением
    await page.getByRole('tab', { name: 'Все' }).click();
    await card(page, name).getByRole('button', { name: 'Действия с проектом' }).click();
    await page.getByRole('menuitem', { name: 'Удалить' }).click();
    await page.getByRole('dialog', { name: 'Удалить проект?' }).getByRole('button', { name: 'Удалить' }).click();
    await expect(card(page, name)).toHaveCount(0);
  } finally {
    await deleteProject(page, id);
  }
});

test('вид списком запоминается после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Списком' }).click();
  await expect(page.getByRole('button', { name: 'Списком' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Списком' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Плиткой' }).click();
});

test('настройки: профиль и смена темы', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Профиль и настройки' }).click();
  const drawer = page.getByRole('dialog', { name: 'Настройки' });
  await expect(drawer.getByText('Сменить имя')).toBeVisible();
  await drawer.getByRole('combobox').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await drawer.getByRole('combobox').selectOption('system');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
});
