/**
 * Помощники сценариев: доступ к состоянию приложения (отладочный хэндл дев-сборки),
 * ожидание загрузки сцены, удаление тестовых проектов через API.
 */
import { expect, type Page } from '@playwright/test';

/** Низкие настройки графики: программный рендер в CI не тянет тени высокого качества. */
export async function useLowGraphics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'vrhc:graphics',
      JSON.stringify({ preset: 'low', shadows: false, shadowMapSize: 512, resolutionScale: 0.75, antialias: false, showFps: false }),
    );
    localStorage.setItem('vrhc:onboarded:v2', '1');
  });
}

/** Прочитать значение из Redux-стора (window.__vrhc есть только в режиме разработки). */
export function readStore<T>(page: Page, pick: string): Promise<T> {
  return page.evaluate((path) => {
    const store = (window as unknown as { __vrhc?: { store: { getState: () => unknown } } }).__vrhc?.store;
    if (!store) throw new Error('Отладочный хэндл window.__vrhc недоступен — запустите дев-сервер');
    return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], store.getState()) as T;
  }, pick);
}

/** Дождаться открытия проекта и окончания загрузки ассетов сцены. */
export async function waitForScene(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/project\/[\w-]+$/);
  await expect.poll(() => readStore<string>(page, 'projectSession.status'), { timeout: 60_000 }).toBe('ready');
  await expect(page.getByText(/Загружаем сцену/)).toHaveCount(0, { timeout: 90_000 });
}

/** Удалить проект через API (очистка после сценария; не маскирует исходную ошибку теста). */
export async function deleteProject(page: Page, id: string): Promise<void> {
  if (page.isClosed()) {
    console.warn(`Страница закрыта — тестовый проект ${id} не удалён`);
    return;
  }
  const status = await page.evaluate(async (projectId) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.status;
  }, id);
  expect([200, 204, 404]).toContain(status);
}

/** id проекта из адреса редактора. */
export function projectIdFromUrl(page: Page): string {
  const match = /\/project\/([\w-]+)/.exec(page.url());
  if (!match) throw new Error(`Не адрес редактора: ${page.url()}`);
  return match[1];
}
