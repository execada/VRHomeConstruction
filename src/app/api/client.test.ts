import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiRequestError } from './client';
import { subscribeSessionEnd } from './session';

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

/** Ответ сервера с JSON-телом. */
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn<typeof fetch>();
let ended: string[] = [];
let unsubscribe: () => void = () => {};

/** Ошибка запроса (запрос обязан упасть). */
async function failure(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(error instanceof ApiRequestError)) throw new Error(`ожидалась ApiRequestError, получено ${String(error)}`);
  return error;
}

/** Заголовок Authorization запроса номер call. */
function sentAuthorization(call: number): string | undefined {
  return (fetchMock.mock.calls[call]?.[1]?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('клиент API: конец сессии по ответу сервера', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    ended = [];
    unsubscribe = subscribeSessionEnd((source) => ended.push(source));
  });
  afterEach(() => {
    unsubscribe();
    vi.unstubAllGlobals();
  });

  it('401 на запрос с сохранённым токеном стирает токен и сообщает о конце сессии', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockResolvedValue(reply(401, { error: 'invalid or expired token' }));

    const error = await failure(api.get('/api/projects'));

    expect(sentAuthorization(0)).toBe('Bearer jwt-1');
    expect(error.status).toBe(401);
    expect(error.sessionEnded).toBe(true);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(ended).toEqual(['rejected']);
  });

  it('параллельные отказы одного токена сообщают о конце сессии один раз', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockImplementation(async () => reply(401, { error: 'invalid or expired token' }));

    const errors = await Promise.all([failure(api.get('/api/projects')), failure(api.get('/api/folders')), failure(api.put('/api/projects/p1', {}))]);

    expect(errors.map((e) => e.sessionEnded)).toEqual([true, true, true]);
    expect(ended).toEqual(['rejected']);
  });

  it('«authorization required» на запрос с токеном — тоже конец сессии', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockResolvedValue(reply(401, { error: 'Authorization required' }));

    const error = await failure(api.get('/api/auth/me'));

    expect(error.sessionEnded).toBe(true);
    expect(ended).toEqual(['rejected']);
  });

  it('вход, регистрация и сброс пароля без токена не выходят из аккаунта', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'invalid email or password' }));
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'invalid verification code' }));
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'authorization required' }));

    const login = await failure(api.post('/api/auth/login', { email: 'a@b.c', password: 'x' }));
    const reset = await failure(api.post('/api/auth/password/reset', { email: 'a@b.c', code: '000000', password: 'secret1' }));
    const guest = await failure(api.get('/api/projects'));

    expect(sentAuthorization(0)).toBeUndefined();
    expect([login, reset, guest].map((e) => e.sessionEnded)).toEqual([false, false, false]);
    expect(ended).toEqual([]);
  });

  it('401 с другим смыслом (неверный код у защищённого запроса) сессию не закрывает', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockResolvedValue(reply(401, { error: 'invalid verification code' }));

    const error = await failure(api.post('/api/auth/email/verify', { newEmail: 'n@b.c', code: '000000' }));

    expect(error.sessionEnded).toBe(false);
    expect(localStorage.getItem('auth_token')).toBe('jwt-1');
    expect(ended).toEqual([]);
  });

  it('отказ старому токену после нового входа не трогает новую сессию', async () => {
    localStorage.setItem('auth_token', 'jwt-old');
    let answer: (response: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));

    const pending = failure(api.get('/api/projects'));
    localStorage.setItem('auth_token', 'jwt-new');
    answer(reply(401, { error: 'invalid or expired token' }));
    const error = await pending;

    expect(error.sessionEnded).toBe(true);
    expect(localStorage.getItem('auth_token')).toBe('jwt-new');
    expect(ended).toEqual([]);
  });

  it('401 без JSON (прокси) и 403 сессию не закрывают', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockResolvedValueOnce(new Response('<html>Unauthorized</html>', { status: 401 }));
    fetchMock.mockResolvedValueOnce(reply(403, { error: 'invalid password' }));
    fetchMock.mockResolvedValueOnce(reply(401, { message: 'no error field' }));

    const proxy = await failure(api.get('/api/projects'));
    const forbidden = await failure(api.post('/api/auth/email/send-code', { newEmail: 'n@b.c', password: 'x' }));
    const odd = await failure(api.get('/api/projects'));

    expect(proxy.message).toBe('HTTP 401');
    expect(odd.message).toBe('HTTP 401');
    expect([proxy, forbidden, odd].map((e) => e.sessionEnded)).toEqual([false, false, false]);
    expect(localStorage.getItem('auth_token')).toBe('jwt-1');
    expect(ended).toEqual([]);
  });

  it('успешные ответы и 204 возвращаются как раньше', async () => {
    localStorage.setItem('auth_token', 'jwt-1');
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.get('/api/health')).resolves.toEqual({ ok: true });
    await expect(api.del('/api/projects/p1')).resolves.toBeUndefined();
    expect(ended).toEqual([]);
  });
});
