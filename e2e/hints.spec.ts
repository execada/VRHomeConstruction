/**
 * Подсказки и обучение: в пустой комнате подсказка у каталога («здесь выберите модели»), «Понятно»
 * её закрывает; кнопка «?» запускает обучение (листается кнопками и стрелками, Esc закрывает),
 * показывает подсказки заново и выключает их ползунком — выбор сохраняется после перезагрузки.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, useLowGraphics, waitForScene } from './support/app';

async function createBlankProject(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Пустой проект/ }).click();
  await waitForScene(page);
  return projectIdFromUrl(page);
}

const help = (page: Page) => page.getByRole('dialog', { name: 'Помощь' });
const openHelp = (page: Page) => page.getByRole('button', { name: 'Помощь и подсказки' }).click();
const storedHints = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('vrhc:hints') ?? 'null') as { enabled: boolean } | null);

test('подсказки ведут по редактору, обучение листается, ползунок выключает подсказки', async ({ page }) => {
  test.slow();
  // Включить подсказки один раз на вкладку (до useLowGraphics, который иначе их выключает)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('vrhc:e2e-hints')) return;
    sessionStorage.setItem('vrhc:e2e-hints', '1');
    localStorage.setItem('vrhc:hints', JSON.stringify({ enabled: true, dismissed: [], tourDone: true }));
  });
  await useLowGraphics(page);
  const id = await createBlankProject(page);

  try {
    const catalogHint = page.getByRole('note', { name: 'Подсказка: Здесь выберите модели' });
    await expect(catalogHint).toBeVisible();
    await catalogHint.getByRole('button', { name: 'Понятно' }).click();
    await expect(catalogHint).toBeHidden();

    // Обучение: кнопки и стрелки листают шаги, Esc закрывает
    await openHelp(page);
    await help(page).getByRole('button', { name: 'Пройти обучение' }).click();
    await expect(page.getByRole('note', { name: 'Обучение: Обучение за минуту' })).toBeVisible();
    await page.getByRole('button', { name: 'Далее' }).click();
    await expect(page.getByRole('note', { name: 'Обучение: Каталог моделей' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('note', { name: 'Обучение: Дизайн' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('note', { name: 'Обучение: Каталог моделей' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('note', { name: /^Обучение/ })).toHaveCount(0);

    // Закрытые подсказки — заново, затем ползунком выключить
    await openHelp(page);
    await help(page).getByRole('button', { name: 'Показать подсказки заново' }).click();
    await page.keyboard.press('Escape');
    await expect(catalogHint).toBeVisible();
    await openHelp(page);
    await expect(help(page).getByRole('switch', { name: 'Показывать подсказки' })).toBeChecked();
    await help(page).getByText('Показывать подсказки').click();
    await expect(help(page).getByRole('switch', { name: 'Показывать подсказки' })).not.toBeChecked();
    await expect(catalogHint).toBeHidden();
    expect((await storedHints(page))?.enabled).toBe(false);

    // После перезагрузки подсказки по-прежнему выключены
    await page.reload();
    await waitForScene(page);
    await page.waitForTimeout(1000);
    await expect(catalogHint).toBeHidden();
    await openHelp(page);
    await expect(help(page).getByRole('switch', { name: 'Показывать подсказки' })).not.toBeChecked();
  } finally {
    await deleteProject(page, id);
  }
});
