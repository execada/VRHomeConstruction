/**
 * Настенные и потолочные предметы: постер сам вешается на ближайшую стену на высоту из каталога,
 * в середине комнаты (без стены рядом) не ставится, люстра висит под потолком; правки в инспекторе
 * оставляют постер на стене, после перезагрузки всё на месте.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, readStore, useLowGraphics, waitForScene } from './support/app';

interface Item {
  id: string;
  name: string;
  position: number[];
  rotation: number[];
  height?: number;
  mount?: string;
}

/** Пикселей на метр в виде сверху для пустой комнаты 4 × 4 м и окна 1440 × 900. */
const PX = 119;

const items = (page: Page) => readStore<Item[]>(page, 'furniture.items');
const byName = (page: Page, name: string) => items(page).then((list) => list.find((i) => i.name === name));

async function createBlankProject(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Пустой проект/ }).click();
  await waitForScene(page);
  return projectIdFromUrl(page);
}

/** Клик в точку пола (x, z), м, в виде сверху. */
async function clickFloor(page: Page, x: number, z: number): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('Нет 3D-вьюпорта');
  const sx = box.x + box.width / 2 + x * PX;
  const sy = box.y + box.height / 2 + z * PX;
  await page.mouse.move(sx - 20, sy, { steps: 4 });
  await page.mouse.move(sx, sy, { steps: 4 });
  await page.mouse.click(sx, sy);
}

async function pickModel(page: Page, query: string, name: RegExp): Promise<void> {
  await page.getByLabel('Поиск мебели').fill(query);
  await page.getByRole('button', { name }).first().click();
}

async function setNumber(page: Page, label: string, value: number): Promise<void> {
  const field = page.getByRole('complementary', { name: 'Свойства' }).getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}

test('постер вешается на стену, люстра — под потолок, и всё сохраняется', async ({ page }) => {
  test.slow();
  await useLowGraphics(page);
  const id = await createBlankProject(page);

  try {
    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'План' }).click();
    await page.getByRole('tab', { name: 'Мебель' }).click();

    // Постер у задней стены: сам прижимается к ней фасадом в комнату, центр — на высоте 1,5 м
    await pickModel(page, 'Постер', /^Постер в чёрной раме/);
    await clickFloor(page, 0.3, -1.7);
    await expect.poll(() => items(page).then((list) => list.length)).toBe(1);
    const poster = (await byName(page, 'Постер в чёрной раме'))!;
    expect(poster.mount).toBe('back');
    expect(poster.rotation[1]).toBeCloseTo(0);
    expect(poster.position[2]).toBeLessThan(-1.95);
    expect(poster.position[1] + (poster.height ?? 0.841) / 2).toBeCloseTo(1.5, 1);

    // Новый постер выделен: сдвиг вдоль стены и новая высота в инспекторе — он остаётся на стене
    expect(await readStore<{ id: string } | null>(page, 'selection.current').then((s) => s?.id)).toBe(poster.id);
    await setNumber(page, 'X', 100);
    await setNumber(page, 'Высота над полом', 120);
    await expect.poll(() => byName(page, 'Постер в чёрной раме').then((p) => p?.position[0])).toBeCloseTo(1, 2);
    const moved = (await byName(page, 'Постер в чёрной раме'))!;
    expect(moved.position[1]).toBeCloseTo(1.2, 2);
    expect(moved.position[2]).toBeCloseTo(poster.position[2], 3);
    await expect(page.getByRole('complementary', { name: 'Свойства' }).getByText('Задняя стена')).toBeVisible();

    // В середине комнаты стены рядом нет — постер не ставится
    await pickModel(page, 'Постер', /^Постер в чёрной раме/);
    await clickFloor(page, 0, 0);
    await expect(page.getByText('Настенный предмет вешается на стену')).toBeVisible();
    expect(await items(page).then((list) => list.length)).toBe(1);
    await page.keyboard.press('Escape');

    // Люстра — под потолком
    await pickModel(page, 'Люстра', /^Люстра классическая/);
    await clickFloor(page, 0.5, 0.5);
    await expect.poll(() => items(page).then((list) => list.length)).toBe(2);
    const lamp = (await byName(page, 'Люстра классическая'))!;
    expect(lamp.mount).toBe('ceiling');
    const ceiling = await readStore<number>(page, 'editor.dimensions.height');
    expect(lamp.position[1] + (lamp.height ?? 0.798)).toBeCloseTo(ceiling, 2);
    await page.keyboard.press('Escape');

    // После перезагрузки — на тех же местах
    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
    await page.reload();
    await waitForScene(page);
    await expect.poll(() => byName(page, 'Постер в чёрной раме').then((p) => p?.mount)).toBe('back');
    expect((await byName(page, 'Люстра классическая'))?.mount).toBe('ceiling');
    const reloaded = (await byName(page, 'Постер в чёрной раме'))!;
    expect(reloaded.position[0]).toBeCloseTo(1, 2);
    expect(reloaded.position[1]).toBeCloseTo(1.2, 2);

    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'Облёт' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/results/mounts.png' });
  } finally {
    await deleteProject(page, id);
  }
});
