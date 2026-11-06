/**
 * Этажи и лестницы: второй этаж, лестница из каталога, мебель наверху и всё на месте после
 * перезагрузки; подъём по лестнице от первого лица; режим «Улица» — здание целиком;
 * старый проект (документ v3) открывается как одноэтажный.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, readStore, useLowGraphics, waitForScene } from './support/app';

/** Новый пустой проект в редакторе (низкие настройки графики задаёт сам сценарий). */
async function createBlankProject(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Пустой проект/ }).click();
  await waitForScene(page);
  return projectIdFromUrl(page);
}

/** Ввести число в поле с подписью (в левой панели или в инспекторе) и применить (Enter). */
async function setNumber(page: Page, panel: 'Инструменты' | 'Свойства', label: string, value: number): Promise<void> {
  const field = page.getByRole('complementary', { name: panel }).getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}

/** Клик по центру 3D-вьюпорта (камера облёта смотрит в центр пола активного этажа). */
async function clickViewportCenter(page: Page): Promise<void> {
  const box = await page.locator('canvas').first().boundingBox();
  if (!box) throw new Error('Нет 3D-вьюпорта');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 20, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.click(x, y);
}

const floors = (page: Page) => page.getByRole('radiogroup', { name: 'Этажи' }).first();
const camera = (page: Page) => page.getByRole('radiogroup', { name: 'Камера' });

test('второй этаж: лестница, мебель наверху, перезагрузка, подъём от первого лица и вид с улицы', async ({ page }) => {
  // Длинный сценарий с 3D: на CI без видеокарты кадры редкие — втрое больше времени
  test.slow();
  await useLowGraphics(page);
  const id = await createBlankProject(page);

  try {
    // Комната 6 × 9 м: прямому маршу на 3,3 м подъёма нужно около 5 м
    await page.getByRole('tab', { name: 'Комната' }).click();
    await setNumber(page, 'Инструменты', 'Ширина', 6);
    await setNumber(page, 'Инструменты', 'Глубина', 9);
    await expect.poll(() => readStore<number>(page, 'editor.dimensions.depth')).toBe(9);

    // Второй этаж — тот же контур, становится активным
    await page.getByRole('button', { name: 'Добавить этаж сверху' }).first().click();
    await expect(floors(page).getByRole('radio')).toHaveText(['2 этаж', '1 этаж']);
    const upperId = await readStore<string>(page, 'building.activeId');
    expect(await readStore<number>(page, 'editor.dimensions.depth')).toBe(9);

    // Лестница на первом этаже — из каталога; низ марша — перед точкой старта от первого лица
    await floors(page).getByRole('radio', { name: '1 этаж' }).click();
    await expect.poll(() => readStore<string>(page, 'building.activeId')).toBe('floor-1');
    await page.getByRole('tab', { name: 'Мебель' }).click();
    await page.getByRole('tablist', { name: 'Категории' }).getByRole('tab', { name: 'Лестницы' }).click();
    await page.getByRole('button', { name: /^Прямая лестница/ }).click();
    await clickViewportCenter(page);
    await expect.poll(() => readStore<unknown[]>(page, 'editor.stairs').then((s) => s.length)).toBe(1);
    await setNumber(page, 'Свойства', 'X', 0);
    await setNumber(page, 'Свойства', 'Z', -90);
    await expect.poll(() => readStore<Array<{ position: number[] }>>(page, 'editor.stairs').then((s) => s[0].position)).toEqual([0, -0.9]);

    // Мебель наверху: встаёт на пол второго этажа, а не в проём над лестницей
    await floors(page).getByRole('radio', { name: '2 этаж' }).click();
    await expect.poll(() => readStore<string>(page, 'building.activeId')).toBe(upperId);
    await expect.poll(() => readStore<unknown[]>(page, 'building.stash.floor-1.stairs').then((s) => s.length)).toBe(1);
    await page.getByRole('tablist', { name: 'Категории' }).getByRole('tab', { name: 'Все' }).click();
    await page.getByLabel('Поиск мебели').fill('Холодильник');
    await page.getByRole('button', { name: /^Холодильник/ }).first().click();
    await clickViewportCenter(page);
    await expect.poll(() => readStore<unknown[]>(page, 'furniture.items').then((items) => items.length)).toBe(1);
    await page.keyboard.press('Escape');

    // Автосохранение и восстановление: оба этажа, лестница и мебель наверху на месте
    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
    await page.reload();
    await waitForScene(page);
    await expect.poll(() => readStore<unknown[]>(page, 'building.floors').then((f) => f.length)).toBe(2);
    expect(await readStore<string>(page, 'building.activeId')).toBe('floor-1');
    expect(await readStore<unknown[]>(page, 'editor.stairs')).toHaveLength(1);
    expect(await readStore<unknown[]>(page, `building.stash.${upperId}.furniture`)).toHaveLength(1);
    await expect(floors(page).getByRole('radio')).toHaveText(['2 этаж', '1 этаж']);

    // От первого лица: бегом вперёд (Shift+W) — по лестнице на второй этаж, он становится активным
    await camera(page).getByRole('radio', { name: 'От лица' }).click();
    await expect(page.getByText(/по лестнице — на другой этаж/)).toBeVisible();
    await page.waitForTimeout(1000);
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await expect.poll(() => readStore<string>(page, 'building.activeId'), { timeout: 60_000 }).toBe(upperId);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');

    // «Улица»: облёт здания снаружи — все этажи без срезов
    await camera(page).getByRole('radio', { name: 'Улица' }).click();
    await expect(page.getByText(/Здание с улицы/)).toBeVisible();
    expect(await readStore<string>(page, 'camera.mode')).toBe('street');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'e2e/results/floors-street.png' });
  } finally {
    await deleteProject(page, id);
  }
});

/** Документ сцены v3 (одна квартира) — так проекты сохранялись до этажей. */
function sceneV3() {
  const plain = (color: string) => ({ textureId: null, color, scale: 1 });
  const wall = { thickness: 0.2, material: 'brick' };
  return {
    schemaVersion: 3,
    dimensions: { width: 5, height: 2.8, depth: 4 },
    outerWalls: { front: wall, back: wall, left: wall, right: wall },
    finishes: { floor: plain('#e8e0d0'), ceiling: plain('#ffffff'), walls: { front: plain('#ece6dc'), back: plain('#ece6dc'), left: plain('#ece6dc'), right: plain('#ece6dc') } },
    removedWalls: [],
    light: { intensity: 1.2, ambientIntensity: 0.4, color: '#ffffff', enabled: true, temperature: 3500, colorMode: 'temperature', shadows: true },
    environment: {
      sun: { enabled: true, side: 'front', timeOfDay: 14, intensity: 2, shadows: true },
      sky: { mode: 'sky', hdriId: null, color: '#cfe3f0', rotation: 0, exposure: 1 },
    },
    openings: [{ id: 'w1', wallId: 'front', type: 'window', position: [0, 1.5], width: 1.2, height: 1.4 }],
    partitions: [],
    rooms: [{ id: 'r1', name: 'Кухня', anchor: [0, 0] }],
    furniture: [{ id: 'f1', name: 'Табурет', modelPath: 'primitive:stool', position: [1, 0, 1], rotation: [0, 0, 0], scale: 1 }],
  };
}

test('старый одноэтажный проект открывается как один этаж без потерь', async ({ page }) => {
  await useLowGraphics(page);
  const id = await createBlankProject(page);
  try {
    const file = { app: 'vr-home-construction', version: 2, name: 'Старый проект', savedAt: '2026-10-01T00:00:00Z', roomData: sceneV3() };
    await page.locator('input[type="file"][accept*="json"]').setInputFiles({ name: 'old.vrhome.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await expect.poll(() => readStore<number>(page, 'editor.dimensions.width')).toBe(5);
    expect(await readStore<Array<{ name: string }>>(page, 'building.floors').then((f) => f.map((x) => x.name))).toEqual(['1 этаж']);
    expect(await readStore<unknown[]>(page, 'furniture.items')).toHaveLength(1);
    expect(await readStore<unknown[]>(page, 'editor.openings.front')).toHaveLength(1);
    expect(await readStore<Array<{ name: string }>>(page, 'editor.rooms').then((r) => r[0].name)).toBe('Кухня');
    await expect(floors(page).getByRole('radio')).toHaveText(['1 этаж']);
    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
  } finally {
    await deleteProject(page, id);
  }
});
