/**
 * Квартира в многоэтажке: во вкладке «Свет» включается «Квартира в доме», задаются этаж и этажность;
 * настройка сохраняется с проектом, вид «Улица» показывает дом целиком.
 */
import { expect, test, type Page } from '@playwright/test';
import { deleteProject, projectIdFromUrl, readStore, useLowGraphics, waitForScene } from './support/app';

interface Residence {
  enabled: boolean;
  storey: number;
  storeys: number;
}

async function createBlankProject(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Новый проект' }).first().click();
  await page.getByRole('dialog', { name: 'Выбор стартового шаблона' }).getByRole('button', { name: /Пустой проект/ }).click();
  await waitForScene(page);
  return projectIdFromUrl(page);
}

async function setNumber(page: Page, label: string, value: number): Promise<void> {
  const field = page.getByRole('complementary', { name: 'Инструменты' }).getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press('Enter');
}

const residence = (page: Page) => readStore<Residence | undefined>(page, 'environment.residence');

test('квартира на этаже многоэтажки: вид с высоты этажа сохраняется с проектом', async ({ page }) => {
  test.slow();
  await useLowGraphics(page);
  const id = await createBlankProject(page);

  try {
    await page.getByRole('tab', { name: 'Свет' }).click();
    const section = page.getByRole('complementary', { name: 'Инструменты' });
    await section.getByText('Квартира в доме').locator('..').getByText('Выкл').click();
    await expect.poll(() => residence(page).then((r) => r?.enabled)).toBe(true);
    await setNumber(page, 'Этажей в доме', 16);
    await setNumber(page, 'Этаж квартиры', 12);
    await expect.poll(() => residence(page)).toEqual({ enabled: true, storey: 12, storeys: 16 });

    // Этаж выше этажности — дом становится выше
    await setNumber(page, 'Этаж квартиры', 20);
    await expect.poll(() => residence(page)).toEqual({ enabled: true, storey: 16, storeys: 16 });
    await setNumber(page, 'Этажей в доме', 25);
    await setNumber(page, 'Этаж квартиры', 12);
    await expect.poll(() => residence(page)).toEqual({ enabled: true, storey: 12, storeys: 25 });

    await page.getByRole('radiogroup', { name: 'Камера' }).getByRole('radio', { name: 'Улица' }).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/results/residence-street.png' });

    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
    await page.reload();
    await waitForScene(page);
    await expect.poll(() => residence(page)).toEqual({ enabled: true, storey: 12, storeys: 25 });
  } finally {
    await deleteProject(page, id);
  }
});
