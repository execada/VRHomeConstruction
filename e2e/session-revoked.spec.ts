/**
 * Конец сессии после смены пароля: на своём новом аккаунте (регистрация через API) вкладка,
 * открытая до сброса пароля, после следующего запроса выходит из аккаунта — гостевой вид
 * и одно сообщение «Сессия завершена — войдите снова». В редакторе несохранённая правка
 * остаётся на устройстве и возвращается в проект после входа с новым паролем.
 * Нужен бэкенд в режиме SMTP_LOG_ONLY и путь к его логу в E2E_BACKEND_LOG.
 */
import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readStore, recordToasts, toastsShown, useLowGraphics, waitForScene } from './support/app';
import { backendLogPath, registerAccount, resetPassword } from './support/backendLog';

const SESSION_ENDED = 'Сессия завершена — войдите снова';
/** Готовое превью: редактор не станет снимать своё, и лишнего запроса во время сценария нет. */
const PREVIEW = 'data:image/png;base64,iVBORw0KGgo=';

const secret = () => randomBytes(9).toString('base64url');

/** Сколько раз было показано сообщение (по записи recordToasts, а не по тому, что ещё на экране). */
async function timesShown(page: Page, text: string): Promise<number> {
  return (await toastsShown(page)).filter((shown) => shown.includes(text)).length;
}

/** Свой аккаунт: сброс пароля общего тестового аккаунта закрыл бы сессии остальных сценариев. */
function newAccount(prefix: string) {
  return { email: `e2e-${prefix}-${Date.now()}@vrhome.test`, password: `old-${secret()}`, newPassword: `new-${secret()}` };
}

/** Лог бэкенда с кодами: локально без него сценарий пропускается, в CI обязателен. */
function requireBackendLog(): string {
  const log = backendLogPath();
  test.skip(!log && !process.env.CI, 'Задайте E2E_BACKEND_LOG — путь к логу бэкенда в режиме SMTP_LOG_ONLY (см. e2e/README.md)');
  if (!log) throw new Error('E2E_BACKEND_LOG не задан — в CI он обязателен (.github/workflows/ci-cd.yml)');
  return log;
}

/** Проект через API (с превью); возвращает id. */
async function createProject(request: APIRequestContext, token: string, name: string): Promise<string> {
  const headers = { Authorization: `Bearer ${token}` };
  const created = await request.post('/api/projects', { headers, data: { name, status: 'active' } });
  expect(created.ok(), await created.text()).toBe(true);
  const id = ((await created.json()) as { _id: string })._id;
  const patched = await request.patch(`/api/projects/${id}`, { headers, data: { thumbnail: PREVIEW } });
  expect(patched.ok(), await patched.text()).toBe(true);
  return id;
}

/** Удалить проект, войдя через API тем паролем, что подходит (сессия вкладки могла закончиться). */
async function removeProject(request: APIRequestContext, email: string, passwords: string[], id: string): Promise<void> {
  for (const password of passwords) {
    const login = await request.post('/api/auth/login', { data: { email, password } });
    if (!login.ok()) continue;
    const { token } = (await login.json()) as { token: string };
    const res = await request.delete(`/api/projects/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (![200, 204, 404].includes(res.status())) console.warn(`Тестовый проект ${id} не удалён: ${res.status()}`);
    return;
  }
  console.warn(`Тестовый проект ${id} не удалён: не удалось войти`);
}

/** Войти в открытом окне входа; ждать, пока загрузятся данные пользователя (последние — шаблоны). */
async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Вход' });
  await dialog.getByLabel('Почта или логин').fill(email);
  await dialog.getByLabel('Пароль', { exact: true }).fill(password);
  const dataLoaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/layouts' && r.request().method() === 'GET', { timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(dialog).toBeHidden();
  await dataLoaded;
}

test('главная: после смены пароля следующий запрос вкладки показывает гостевой вид', async ({ page, request }) => {
  test.slow();
  const log = requireBackendLog();
  const account = newAccount('revoked');
  const token = await registerAccount(request, log, account.email, account.password);
  const name = `E2E Сессия ${Date.now()}`;
  const id = await createProject(request, token, name);

  try {
    await recordToasts(page);
    await page.goto('/');
    await page.getByRole('banner').getByRole('button', { name: 'Войти' }).click();
    await submitLogin(page, account.email, account.password);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(card).toBeVisible();

    await resetPassword(request, log, account.email, account.newPassword);
    // Вкладка узнаёт о смене пароля только из ответа на следующий запрос.
    await expect(page.getByRole('button', { name: 'Профиль и настройки' })).toBeVisible();

    await card.getByRole('button', { name: 'Добавить в избранное' }).click();
    await expect(page.getByRole('heading', { name: 'Проектируйте интерьер в 3D и VR' })).toBeVisible();
    await expect(page.getByRole('banner').getByRole('button', { name: 'Войти' })).toBeVisible();
    await expect.poll(() => timesShown(page, SESSION_ENDED)).toBe(1);
    expect(await toastsShown(page), 'других сообщений нет').toEqual([SESSION_ENDED]);
    expect(await page.evaluate(() => localStorage.getItem('auth_token')), 'отклонённый токен стёрт').toBeNull();

    await page.getByRole('banner').getByRole('button', { name: 'Войти' }).click();
    await submitLogin(page, account.email, account.newPassword);
    await expect(card).toBeVisible();
  } finally {
    await removeProject(request, account.email, [account.newPassword, account.password], id);
  }
});

test('редактор: несохранённая правка переживает конец сессии и возвращается после входа', async ({ page, request }) => {
  test.slow();
  const log = requireBackendLog();
  const account = newAccount('revoked-editor');
  const token = await registerAccount(request, log, account.email, account.password);
  const id = await createProject(request, token, `E2E Сессия в редакторе ${Date.now()}`);
  const panel = page.getByRole('status').filter({ hasText: 'Войдите, чтобы открыть проект' });

  try {
    // По ссылке без входа: страница проекта просит войти и после входа открывает его сама.
    await useLowGraphics(page);
    await recordToasts(page);
    await page.goto(`/project/${id}`);
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText('Несохранённые изменения');
    await panel.getByRole('button', { name: 'Войти' }).click();
    await submitLogin(page, account.email, account.password);
    await waitForScene(page);

    await resetPassword(request, log, account.email, account.newPassword);

    // Правка после смены пароля: автосохранение получает 401 — выход, правка остаётся на устройстве.
    const before = await readStore<number>(page, 'editor.dimensions.width');
    const width = Math.round((before + 1.25) * 100) / 100;
    const field = page.getByRole('complementary', { name: 'Свойства' }).getByLabel('Ширина', { exact: true });
    await field.fill(String(width));
    await field.press('Enter');

    await expect(panel).toContainText('Несохранённые изменения остались на этом устройстве', { timeout: 30_000 });
    await expect.poll(() => timesShown(page, SESSION_ENDED)).toBe(1);
    expect(await timesShown(page, 'Не удалось сохранить на сервер'), 'без своей ошибки автосохранения').toBe(0);
    const backup = await page.evaluate((projectId) => {
      const raw = localStorage.getItem(`vrhc:backup:${projectId}`);
      return raw ? (JSON.parse(raw) as { synced: boolean; roomData: { floors: Array<{ dimensions: { width: number } }> } }) : null;
    }, id);
    expect(backup?.synced, 'локальная копия ждёт сохранения на сервер').toBe(false);
    expect(backup?.roomData.floors[0].dimensions.width).toBeCloseTo(width, 2);

    // Вход с новым паролем: проект открывается снова с правкой и досохраняет её на сервер.
    await panel.getByRole('button', { name: 'Войти' }).click();
    await submitLogin(page, account.email, account.newPassword);
    await waitForScene(page);
    await expect.poll(() => readStore<number>(page, 'editor.dimensions.width')).toBeCloseTo(width, 2);
    await expect.poll(() => timesShown(page, 'Восстановлены несохранённые изменения')).toBe(1);
    await expect.poll(() => readStore<string>(page, 'projectSession.saveState'), { timeout: 30_000 }).toBe('saved');
    expect(await timesShown(page, SESSION_ENDED), 'сообщение о конце сессии — одно за весь сценарий').toBe(1);

    const session = await page.evaluate(() => localStorage.getItem('auth_token'));
    const saved = await request.get(`/api/projects/${id}`, { headers: { Authorization: `Bearer ${session}` } });
    expect(saved.ok(), await saved.text()).toBe(true);
    const project = (await saved.json()) as { roomData: { floors: Array<{ dimensions: { width: number } }> } };
    expect(project.roomData.floors[0].dimensions.width, 'правка сохранена на сервере').toBeCloseTo(width, 2);
  } finally {
    await removeProject(request, account.email, [account.newPassword, account.password], id);
  }
});
