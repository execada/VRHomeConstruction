import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { api } from '@/app/api/client';
import { SESSION_ENDED_TEXT } from '@/app/api/errors';
import { UserFeature } from './index';

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/shared/lib/toast', () => ({ toast }));

const { actions, selectors } = UserFeature;
const user = { id: 'u1', name: 'Анна', email: 'anna@example.com' };
const flush = () => new Promise((r) => setTimeout(r, 0));
const fetchMock = vi.fn<typeof fetch>();

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup() {
  const seen: string[] = [];
  const record: Middleware = () => (next) => (action) => {
    seen.push((action as { type: string }).type);
    return next(action);
  };
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...UserFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(record, saga),
  });
  const task = saga.run(UserFeature.sagas.init);
  const logouts = () => seen.filter((type) => type === actions.logout.type).length;
  return { store, task, logouts };
}

/** Событие storage из другой вкладки (в node нет StorageEvent). */
function otherTab(key: string | null) {
  window.dispatchEvent(Object.assign(new Event('storage'), { key }));
}

describe('конец сессии: выход один раз с одним сообщением', () => {
  let running: ReturnType<typeof setup>['task'] | undefined;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    Object.values(toast).forEach((fn) => fn.mockReset());
  });
  afterEach(() => {
    running?.cancel();
    running = undefined;
    vi.unstubAllGlobals();
  });

  function signedIn() {
    localStorage.setItem('auth_token', 'jwt-1');
    const env = setup();
    running = env.task;
    env.store.dispatch(actions.setUser(user));
    return env;
  }

  it('401 на запрос с токеном выходит из аккаунта и показывает «Сессия завершена»', async () => {
    const { store, logouts } = signedIn();
    fetchMock.mockResolvedValue(reply(401, { error: 'invalid or expired token' }));

    await api.get('/api/projects').catch(() => undefined);
    await flush();

    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(SESSION_ENDED_TEXT, expect.any(Number));
  });

  it('несколько отклонённых запросов сразу — один выход и одно сообщение', async () => {
    const { logouts } = signedIn();
    fetchMock.mockImplementation(async () => reply(401, { error: 'invalid or expired token' }));

    await Promise.all(['/api/projects', '/api/folders', '/api/layouts'].map((path) => api.get(path).catch(() => undefined)));
    await flush();

    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('при загрузке страницы с отозванным токеном — тоже один выход', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockResolvedValue(reply(401, { error: 'invalid or expired token' }));
    const { store, task, logouts } = setup();
    running = task;

    store.dispatch(actions.restoreSessionRequested());
    await flush();
    await flush();

    expect(logouts()).toBe(1);
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(selectors.selectUserIsLoading(store.getState())).toBe(false);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('неверный пароль при входе — ошибка в окне, без выхода и сообщения о сессии', async () => {
    const { store, task, logouts } = setup();
    running = task;
    fetchMock.mockResolvedValue(reply(401, { error: 'invalid email or password' }));
    store.dispatch(actions.setFormField({ field: 'email', value: 'anna@example.com' }));
    store.dispatch(actions.setFormField({ field: 'password', value: 'wrong' }));

    store.dispatch(actions.loginRequested());
    await flush();
    await flush();

    expect(selectors.selectUserError(store.getState())).toBe('Неверная почта или пароль');
    expect(logouts()).toBe(0);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('сбой при одном событии не останавливает наблюдение за сессией', async () => {
    const { store, logouts } = signedIn();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    toast.info.mockImplementationOnce(() => {
      throw new Error('toast failed');
    });
    fetchMock.mockImplementation(async () => reply(401, { error: 'invalid or expired token' }));

    await api.get('/api/projects').catch(() => undefined);
    await flush();
    expect(logouts()).toBe(1);
    expect(logged).toHaveBeenCalledWith('Не удалось обработать конец сессии', expect.any(Error));

    localStorage.setItem('auth_token', 'jwt-2');
    store.dispatch(actions.setUser(user));
    await api.get('/api/projects').catch(() => undefined);
    await flush();
    expect(logouts()).toBe(2);
    expect(toast.info).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it('выход в другой вкладке выходит и здесь, а гостя не трогает', async () => {
    const { store, logouts } = signedIn();

    localStorage.removeItem('auth_token');
    otherTab('auth_token');
    await flush();
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);

    otherTab(null);
    await flush();
    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});
