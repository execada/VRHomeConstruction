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
const other = { id: 'u2', name: 'Борис', email: 'boris@example.com' };
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Дождаться цепочки «событие → запрос → ответ → действия». */
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await flush();
};
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

/** Токен, с которым ушёл запрос номер call. */
function authHeader(call: number): string | undefined {
  return (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string> | undefined)?.Authorization;
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
  return { store, task, logouts, seen };
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

describe('вход в другой вкладке', () => {
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

  function start() {
    const env = setup();
    running = env.task;
    return env;
  }

  /** Вкладка вошла по сохранённому токену (как при загрузке страницы). */
  async function restored(token: string, who: typeof user) {
    localStorage.setItem('auth_token', token);
    fetchMock.mockResolvedValueOnce(reply(200, who));
    const env = start();
    env.store.dispatch(actions.restoreSessionRequested());
    await settle();
    expect(selectors.selectUserName(env.store.getState())).toBe(who.name);
    fetchMock.mockReset();
    return env;
  }

  /** Другая вкладка записала свой токен (вход там). */
  function signInElsewhere(token: string) {
    localStorage.setItem('auth_token', token);
    otherTab('auth_token');
  }

  it('гостевая вкладка входит без перезагрузки, без выхода и сообщений', async () => {
    const { store, logouts } = start();
    fetchMock.mockResolvedValue(reply(200, user));

    signInElsewhere('jwt-1');
    await settle();

    expect(selectors.selectUserIsAuth(store.getState())).toBe(true);
    expect(selectors.selectUserName(store.getState())).toBe('Анна');
    expect(authHeader(0)).toBe('Bearer jwt-1');
    expect(logouts()).toBe(0);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('вкладка с другим входом выходит один раз и входит в новый аккаунт, не стирая его токен', async () => {
    const { store, logouts, seen } = await restored('jwt-1', user);
    fetchMock.mockResolvedValue(reply(200, other));

    signInElsewhere('jwt-2');
    await settle();

    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(SESSION_ENDED_TEXT, expect.any(Number));
    expect(seen.lastIndexOf(actions.logout.type)).toBeLessThan(seen.lastIndexOf(actions.setUser.type));
    expect(selectors.selectUserName(store.getState())).toBe('Борис');
    expect(authHeader(0)).toBe('Bearer jwt-2');
    expect(localStorage.getItem('auth_token')).toBe('jwt-2');
  });

  it('повторные события о том же токене — один выход, одно сообщение и один запрос', async () => {
    const { logouts } = await restored('jwt-1', user);
    fetchMock.mockResolvedValue(reply(200, other));

    signInElsewhere('jwt-2');
    otherTab('auth_token');
    otherTab(null);
    await settle();
    otherTab('auth_token');
    await settle();

    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('выход и новый вход в другой вкладке, пришедшие разом, — тоже один выход', async () => {
    const { store, logouts } = await restored('jwt-1', user);
    fetchMock.mockResolvedValue(reply(200, other));

    localStorage.removeItem('auth_token');
    localStorage.setItem('auth_token', 'jwt-2');
    otherTab('auth_token');
    otherTab('auth_token');
    await settle();

    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(selectors.selectUserName(store.getState())).toBe('Борис');
    expect(localStorage.getItem('auth_token')).toBe('jwt-2');
  });

  it('выход по кнопке стирает токен вкладки, а после выхода в другой вкладке запрос без токена второго выхода не даёт', async () => {
    const first = await restored('jwt-1', user);
    first.store.dispatch(actions.logout());
    expect(localStorage.getItem('auth_token')).toBeNull();
    running?.cancel();

    const { logouts } = await restored('jwt-2', other);
    localStorage.removeItem('auth_token');
    otherTab('auth_token');
    await settle();
    fetchMock.mockResolvedValue(reply(401, { error: 'authorization required' }));
    await api.get('/api/projects').catch(() => undefined);
    await settle();

    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('токен стёрли, пока шло восстановление: ответ не применяется, вход не открывается', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const { store, logouts } = start();
    store.dispatch(actions.restoreSessionRequested());
    await flush();
    expect(selectors.selectSessionRestore(store.getState())).toBe('pending');

    localStorage.removeItem('auth_token');
    otherTab('auth_token');
    await flush();
    answer(reply(200, user));
    await settle();

    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(selectors.selectSessionRestore(store.getState())).toBe('idle');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('новый токен, пока шло восстановление старого, — вход с новым', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    const answers: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => answers.push(resolve)));
    const { store } = start();
    store.dispatch(actions.restoreSessionRequested());
    await flush();

    signInElsewhere('jwt-2');
    await flush();
    answers[1]?.(reply(200, other));
    answers[0]?.(reply(200, user));
    await settle();

    expect(authHeader(1)).toBe('Bearer jwt-2');
    expect(selectors.selectUserName(store.getState())).toBe('Борис');
    expect(localStorage.getItem('auth_token')).toBe('jwt-2');
  });
});

describe('восстановление входа без связи с сервером', () => {
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Загрузка страницы с сохранённым токеном. */
  function load() {
    localStorage.setItem('auth_token', 'jwt-1');
    const env = setup();
    running = env.task;
    env.store.dispatch(actions.restoreSessionRequested());
    return env;
  }

  it('нет сети: токен остаётся, вкладка честно ждёт и входит, когда сеть вернулась', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { store, logouts } = load();
    await settle();

    expect(localStorage.getItem('auth_token')).toBe('jwt-1');
    expect(selectors.selectSessionRestore(store.getState())).toBe('offline');
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(selectors.selectUserIsLoading(store.getState())).toBe(false);
    expect(logouts()).toBe(0);
    expect(toast.info).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(reply(200, user));
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(selectors.selectUserIsAuth(store.getState())).toBe(true);
    expect(selectors.selectSessionRestore(store.getState())).toBe('idle');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(1)).toBe('Bearer jwt-1');
    warn.mockRestore();
  });

  it('бэкенд за прокси не отвечает (502, 503): повтор по паузе, пауза растёт', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(reply(503, { error: 'internal server error' }))
      .mockResolvedValue(reply(200, user));
    const { store, logouts } = load();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(selectors.selectSessionRestore(store.getState())).toBe('offline');

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(selectors.selectSessionRestore(store.getState())).toBe('offline');

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(selectors.selectUserIsAuth(store.getState())).toBe(true);
    expect(localStorage.getItem('auth_token')).toBe('jwt-1');
    expect(logouts()).toBe(0);
    warn.mockRestore();
  });

  it('«Повторить» — новая попытка сразу, не дожидаясь паузы', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { store } = load();
    await settle();
    expect(selectors.selectSessionRestore(store.getState())).toBe('offline');

    fetchMock.mockResolvedValue(reply(200, user));
    store.dispatch(actions.restoreSessionRequested());
    await settle();

    expect(selectors.selectUserIsAuth(store.getState())).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it.each([
    ['ответ не пользователем', reply(200, { unexpected: true })],
    ['404', reply(404, { error: 'user not found' })],
    ['400', reply(400, { error: 'invalid json body' })],
  ])('%s — токен сброшен: один выход без сообщения о конце сессии', async (_name, response) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(response);
    const { store, logouts } = load();
    await settle();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(selectors.selectSessionRestore(store.getState())).toBe('idle');
    expect(logouts()).toBe(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith('Не удалось восстановить сессию — сохранённый токен сброшен', expect.anything());
    logged.mockRestore();
  });

  it('без связи, а в другой вкладке вышли: повторов больше нет, вкладка — гость', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { store, logouts } = load();
    await settle();

    localStorage.removeItem('auth_token');
    otherTab('auth_token');
    await settle();
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(selectors.selectSessionRestore(store.getState())).toBe('idle');
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(logouts()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
