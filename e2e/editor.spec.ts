/**
 * Редактор: размещение мебели на полу, отмена/повтор, 2D-план со стенами,
 * автосохранение и восстановление после перезагрузки; осмотр от первого лица.
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

/** Дождаться отрисовки кадра: клики R3F проверяют по матрице камеры последнего кадра. */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** Осмотреться от первого лица: перетащить из центра вьюпорта на dx пикселей (0,0025 рад на пиксель). */
async function lookAround(page: Page, dx: number): Promise<void> {
  const center = await viewportCenter(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + dx, center.y, { steps: 8 });
  await page.mouse.up();
  await nextFrames(page);
}

interface PartitionState {
  position: number[];
  openings: Array<{ position: number[]; door?: { open: boolean } }>;
}

// «Студия»: от первого лица камера встаёт в (0; 1,15) и смотрит на дверь задней стены.
// Перегородка спальни стоит на x = 1,2 (от z = −2,3 до 0,5), дверь в ней — на z = 0:
// поворот на 170 px смотрит в глухую часть перегородки, на 314 px — в её дверь.
test('от первого лица перетаскивание осматривает, а не двигает стены и двери', async ({ page }) => {
  await useLowGraphics(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Готовый макет/ }).click();
  await page.getByRole('dialog', { name: 'Готовые макеты' }).getByRole('button', { name: 'Создать проект из шаблона «Студия»' }).click();
  await waitForScene(page);
  const id = projectIdFromUrl(page);

  try {
    const backDoor = () => readStore<PartitionState['openings']>(page, 'editor.openings.back').then((list) => list[0].position);
    const partition = () => readStore<PartitionState[]>(page, 'editor.partitions').then((list) => list[0]);
    const doorBefore = await backDoor();
    const wallBefore = (await partition()).position;

    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'От лица' }).click();
    await expect(page.getByText(/осмотреться/)).toBeVisible();
    // Камера от первого лица подключает обработчики после монтирования в сцене
    await page.waitForTimeout(1000);
    await nextFrames(page);

    // Жест начат на двери задней стены: дверь на месте, взгляд повернулся к перегородке
    await lookAround(page, 170);
    expect(await backDoor()).toEqual(doorBefore);

    // Клик выделяет перегородку, а перетаскивание с неё — снова осмотр
    const center = await viewportCenter(page);
    await page.mouse.click(center.x, center.y);
    await expect.poll(() => readStore<{ kind: string } | null>(page, 'selection.current').then((s) => s?.kind)).toBe('partition');
    await lookAround(page, 60);
    expect((await partition()).position).toEqual(wallBefore);

    // Клик по двери в перегородке открывает её
    await lookAround(page, 84);
    await page.mouse.click(center.x, center.y);
    await expect.poll(() => partition().then((p) => p.openings[0].door?.open)).toBe(true);
    expect((await partition()).position).toEqual(wallBefore);
  } finally {
    await deleteProject(page, id);
  }
});
