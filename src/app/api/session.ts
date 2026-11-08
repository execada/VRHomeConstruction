/**
 * Конец сессии: сервер отклонил сохранённый токен (срок вышел или сессию отозвали — например,
 * сменой пароля) или токен стёрт в другой вкладке. Клиент API стирает отклонённый токен и
 * сообщает об этом подписчикам один раз на токен; сага пользователя по сообщению выходит
 * из аккаунта.
 * @module app/api/session
 */

import { clearStoredToken, getStoredToken, TOKEN_KEY } from './token';

/** Откуда узнали о конце сессии: отказ сервера на запрос этой вкладки или другая вкладка. */
export type SessionEndSource = 'rejected' | 'elsewhere';

type Listener = (source: SessionEndSource) => void;

/** Ответы авторизации сервера (middleware и /api/auth/me): с этим токеном сессии нет. */
const REJECTION_MESSAGES = new Set(['invalid or expired token', 'authorization required', 'invalid authorization header', 'unauthorized']);

const listeners = new Set<Listener>();

/**
 * Ответ значит «токен не даёт сессии», а не другую ошибку с тем же статусом
 * (например, «неверный код» у защищённого запроса смены почты).
 * @param status - HTTP-статус ответа
 * @param message - текст ошибки сервера
 */
export function isSessionRejection(status: number, message: string): boolean {
  return status === 401 && REJECTION_MESSAGES.has(message.trim().toLowerCase());
}

/**
 * Сервер отклонил токен запроса: стереть токен и сообщить подписчикам. Если сохранён уже
 * другой токен (параллельный запрос стёр его раньше, или после нового входа), ничего не делаем —
 * так выход случается один раз, а новая сессия не страдает от ответа на старый запрос.
 * @param token - токен, с которым ушёл отклонённый запрос
 */
export function rejectSession(token: string): void {
  if (getStoredToken() !== token) return;
  clearStoredToken();
  listeners.forEach((listener) => listener('rejected'));
}

/** Окно браузера для событий storage (в тестах и вне браузера его нет). */
function browserWindow(): Window | null {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
}

/**
 * Подписаться на конец сессии: отказ сервера в этой вкладке или стёртый в другой вкладке
 * токен (выход там). Вход в другой вкладке (токен появился) концом сессии не считается.
 * @param listener - получает источник: 'rejected' или 'elsewhere'
 * @returns отписка
 */
export function subscribeSessionEnd(listener: Listener): () => void {
  listeners.add(listener);
  // key === null — localStorage.clear() в другой вкладке.
  const onStorage = (event: StorageEvent) => {
    if ((event.key === TOKEN_KEY || event.key === null) && !getStoredToken()) listener('elsewhere');
  };
  const target = browserWindow();
  target?.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    target?.removeEventListener('storage', onStorage);
  };
}
