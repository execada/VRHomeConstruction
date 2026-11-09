import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isSessionRejection, rejectSession, subscribeSessionEnd } from './session';

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

/** Событие storage из другой вкладки (в node нет StorageEvent). */
function storageEvent(key: string | null): Event {
  return Object.assign(new Event('storage'), { key });
}

describe('isSessionRejection', () => {
  it('узнаёт ответы авторизации сервера без учёта регистра и пробелов', () => {
    expect(isSessionRejection(401, 'invalid or expired token')).toBe(true);
    expect(isSessionRejection(401, ' Authorization required ')).toBe(true);
    expect(isSessionRejection(401, 'invalid authorization header')).toBe(true);
    expect(isSessionRejection(401, 'unauthorized')).toBe(true);
  });

  it('не путает с другими 401 и другими статусами', () => {
    expect(isSessionRejection(401, 'invalid email or password')).toBe(false);
    expect(isSessionRejection(401, 'invalid verification code')).toBe(false);
    expect(isSessionRejection(401, 'HTTP 401')).toBe(false);
    expect(isSessionRejection(403, 'invalid or expired token')).toBe(false);
  });
});

describe('конец сессии', () => {
  let window: EventTarget;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    window = new EventTarget();
    vi.stubGlobal('window', window);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('отказ сервера стирает токен и сообщает каждому подписчику один раз', () => {
    localStorage.setItem('auth_token', 'jwt-1');
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeSessionEnd(first);
    const offSecond = subscribeSessionEnd(second);

    rejectSession('jwt-1');
    rejectSession('jwt-1');

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(first.mock.calls).toEqual([['rejected']]);
    expect(second.mock.calls).toEqual([['rejected']]);
    offFirst();
    offSecond();
  });

  it('после отписки сообщения не приходят', () => {
    localStorage.setItem('auth_token', 'jwt-1');
    const listener = vi.fn();
    subscribeSessionEnd(listener)();

    rejectSession('jwt-1');
    window.dispatchEvent(storageEvent('auth_token'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('токен, стёртый в другой вкладке, — конец сессии и здесь', () => {
    const listener = vi.fn();
    const off = subscribeSessionEnd(listener);

    window.dispatchEvent(storageEvent('auth_token'));
    window.dispatchEvent(storageEvent(null));

    expect(listener.mock.calls).toEqual([['elsewhere'], ['elsewhere']]);
    off();
  });

  it('вход в другой вкладке и чужие ключи сессию не закрывают', () => {
    const listener = vi.fn();
    const off = subscribeSessionEnd(listener);

    localStorage.setItem('auth_token', 'jwt-new');
    window.dispatchEvent(storageEvent('auth_token'));
    localStorage.removeItem('auth_token');
    window.dispatchEvent(storageEvent('vrhc:backup:p1'));

    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it('без window (сборка вне браузера) подписка работает только на отказы сервера', () => {
    vi.stubGlobal('window', undefined);
    localStorage.setItem('auth_token', 'jwt-1');
    const listener = vi.fn();
    const off = subscribeSessionEnd(listener);

    rejectSession('jwt-1');

    expect(listener.mock.calls).toEqual([['rejected']]);
    off();
  });
});
