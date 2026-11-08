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

/**
 * Записывать тексты всплывающих сообщений по мере появления (вызвать до goto). Тост живёт
 * секунды, а в CI кадр сцены рисуется дольше секунды: проверка «сколько раз показано» не должна
 * зависеть от того, застала ли она тост на экране.
 */
export async function recordToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shown: string[] = [];
    Object.assign(window, { __vrhcToasts: shown });
    // Тост — div в контейнере тостов (role="status", aria-live), текст — в последнем span.
    const selector = '[role="status"][aria-live="polite"] > div';
    const collect = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      const toasts = node.matches(selector) ? [node] : Array.from(node.querySelectorAll<HTMLElement>(selector));
      toasts.forEach((toast) => shown.push(toast.lastElementChild?.textContent ?? ''));
    };
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(collect))).observe(document, {
      childList: true,
      subtree: true,
    });
  });
}

/** Тексты всех сообщений, показанных с загрузки страницы (см. recordToasts). */
export function toastsShown(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __vrhcToasts?: string[] }).__vrhcToasts ?? []);
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
