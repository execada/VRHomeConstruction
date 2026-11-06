/**
 * Подушки на диване: подушка из каталога, брошенная на диван, садится в посадочное место у спинки
 * (с наклоном), остаётся на месте после перезагрузки и переезжает вместе с диваном.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, readStore, useLowGraphics, waitForScene } from './support/app';

interface Item {
  id: string;
  name: string;
  position: number[];
  rotation: number[];
  supportId?: string;
  socket?: string;
}

const items = (page: Page) => readStore<Item[]>(page, 'furniture.items');

/** Новый пустой проект в редакторе. */
async function createBlankProject(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Пустой проект/ }).click();
  await waitForScene(page);
  return projectIdFromUrl(page);
}

/** Клик по точке 3D-вьюпорта со смещением от центра, px. */
async function clickViewport(page: Page, dx = 0, dy = 0): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('Нет 3D-вьюпорта');
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2 + dy;
  await page.mouse.move(x - 20, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.click(x, y);
}

/** Выбрать модель в каталоге по названию. */
async function pickModel(page: Page, query: string, name: RegExp): Promise<void> {
  await page.getByLabel('Поиск мебели').fill(query);
  await page.getByRole('button', { name }).first().click();
}

test('подушка садится на диван, сохраняется и переезжает вместе с ним', async ({ page }) => {
  test.slow();
  await useLowGraphics(page);
  const id = await createBlankProject(page);

  try {
    // Вид сверху: центр вьюпорта — центр комнаты, луч смотрит вертикально вниз
    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'План' }).click();
    await page.getByRole('tab', { name: 'Мебель' }).click();
    await pickModel(page, 'Диван', /^Диван(?! бархатный)/);
    await clickViewport(page);
    await expect.poll(() => items(page).then((list) => list.length)).toBe(1);
    const sofa = (await items(page))[0];
    await page.keyboard.press('Escape');

    // Подушка в центр дивана — в среднее место у спинки, с наклоном назад
    await pickModel(page, 'Подушка льняная', /^Подушка льняная/);
    await clickViewport(page);
    await expect.poll(() => items(page).then((list) => list.length)).toBe(2);
    const pillow = (await items(page))[1];
    expect(pillow.supportId).toBe(sofa.id);
    expect(pillow.socket).toBe('back-2');
    expect(pillow.rotation[0]).toBeLessThan(0);
    expect(pillow.position[1]).toBeGreaterThan(0.3);

    // После перезагрузки подушка на том же месте дивана
    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
    await page.reload();
    await waitForScene(page);
    await expect.poll(() => items(page).then((list) => list.find((i) => i.id === pillow.id)?.socket)).toBe('back-2');

    // Диван сдвигается в инспекторе — подушка едет вместе с ним
    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'План' }).click();
    await clickViewport(page, 60, 0);
    await expect.poll(() => readStore<{ id: string } | null>(page, 'selection.current').then((s) => s?.id)).toBe(sofa.id);
    const x = page.getByRole('complementary', { name: 'Свойства' }).getByLabel('X', { exact: true });
    await x.fill('60');
    await x.press('Enter');
    await expect.poll(() => items(page).then((list) => list.find((i) => i.id === pillow.id)?.position[0])).toBeCloseTo(0.6, 1);

    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'Облёт' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/results/cushions.png' });
  } finally {
    await deleteProject(page, id);
  }
});
