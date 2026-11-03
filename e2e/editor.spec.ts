/**
 * Редактор: размещение мебели на полу, отмена/повтор, 2D-план со стенами,
 * автосохранение и восстановление после перезагрузки.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, readStore, useLowGraphics, waitForScene } from './support/app';

/** Центр 3D-вьюпорта (камера облёта смотрит в центр пола). */
async function viewportCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('Нет 3D-вьюпорта');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('мебель встаёт на пол, отмена/повтор, 2D и автосохранение', async ({ page }) => {
  await useLowGraphics(page);
  await page.goto('/');
  // У пустого аккаунта (как в CI) есть ещё кнопка в пустом состоянии — берём кнопку «+» в шапке вкладок.
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Пустой проект/ }).click();
  await waitForScene(page);
  const id = projectIdFromUrl(page);

  try {
    // Размещение: выбрать модель в каталоге и кликнуть по полу
    await page.getByLabel('Поиск мебели').fill('Холодильник');
    await page.getByRole('button', { name: /^Холодильник/ }).first().click();
    const center = await viewportCenter(page);
    await page.mouse.move(center.x - 20, center.y, { steps: 4 });
    await page.mouse.move(center.x, center.y, { steps: 4 });
    await page.mouse.click(center.x, center.y);
    await expect.poll(() => readStore<unknown[]>(page, 'furniture.items').then((items) => items.length)).toBe(1);

    // Предмет стоит на полу (низ на y = 0) и внутри комнаты
    const [item] = await readStore<Array<{ position: [number, number, number] }>>(page, 'furniture.items');
    expect(item.position[1]).toBeCloseTo(0, 5);
    const dims = await readStore<{ width: number; depth: number }>(page, 'editor.dimensions');
    expect(Math.abs(item.position[0])).toBeLessThan(dims.width / 2);
    expect(Math.abs(item.position[2])).toBeLessThan(dims.depth / 2);

    // Отмена и повтор
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await expect.poll(() => readStore<unknown[]>(page, 'furniture.items').then((items) => items.length)).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => readStore<unknown[]>(page, 'furniture.items').then((items) => items.length)).toBe(1);

    // 2D-план: выбор стены
    await page.getByRole('radiogroup', { name: 'Режим редактора' }).getByRole('radio', { name: '2D' }).click();
    const walls = page.getByRole('region', { name: '2D-редактор' }).getByRole('radiogroup', { name: 'Стена' });
    await expect(walls.getByRole('radio')).toHaveText(['Передняя', 'Задняя', 'Левая', 'Правая']);
    await walls.getByRole('radio', { name: 'Левая' }).click();
    await expect(walls.getByRole('radio', { name: 'Левая' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radiogroup', { name: 'Режим редактора' }).getByRole('radio', { name: '3D' }).click();

    // Автосохранение и восстановление
    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
    await page.reload();
    await waitForScene(page);
    await expect.poll(() => readStore<unknown[]>(page, 'furniture.items').then((items) => items.length)).toBe(1);
  } finally {
    await deleteProject(page, id);
  }
});
