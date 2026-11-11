/**
 * Саги сессии: восстановление входа по сохранённому токену (с повторами, пока сервер
 * недоступен) и реакция на конец сессии или смену токена в другой вкладке.
 * @module user/sessionSaga
 */

import { buffers, eventChannel } from 'redux-saga';
import { call, delay, put, race, select, take } from 'typed-redux-saga';
import { authApi } from '@/app/api';
import { isServerUnavailable, isSessionEnded, SESSION_ENDED_TEXT } from '@/app/api/errors';
import { subscribeOnline, subscribeSessionEvents, type SessionEvent } from '@/app/api/session';
import { clearStoredToken, getStoredToken } from '@/app/api/token';
import { toast } from '@/shared/lib/toast';
import { actions } from './slice';
import { selectors } from './selectors';

/** Сообщение о конце сессии висит дольше обычного: выход мог случиться посреди работы. */
const SESSION_ENDED_TOAST_MS = 6000;
/** Паузы между повторами восстановления, пока сервер недоступен; последняя повторяется. */
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

/** Токен, с которым вкладка вошла (или входит): по нему отличают чужой новый вход от своего. */
export interface TabSession {
  token: string | null;
}

export function createTabSession(): TabSession {
  return { token: null };
}

/** Пауза перед повтором или возврат сети — что раньше. */
function* waitToRetry(attempt: number) {
  const channel = eventChannel<true>((emit) => subscribeOnline(() => emit(true)), buffers.sliding(1));
  try {
    const ms = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    yield* race({ timer: delay(ms), online: take(channel) });
  } finally {
    channel.close();
  }
}

/** Ответ неверен: токен сброшен, из аккаунта выходим без сообщения о конце сессии. */
function* dropToken(tab: TabSession, error: unknown) {
  console.error('Не удалось восстановить сессию — сохранённый токен сброшен', error);
  clearStoredToken();
  tab.token = null;
  yield* put(actions.logout({ keepToken: true }));
}

/**
 * Восстановить пользователя по сохранённому JWT. Нет связи с сервером или он перегружен —
 * токен остаётся, попытки повторяются (по возврату сети и с растущей паузой). Токен сбрасывается
 * только при отказе сервера в сессии (это делает клиент API) или неверном ответе.
 * @param tab - токен этой вкладки
 * @param action - запрос восстановления или его отмена (отмена только прерывает прежний запуск)
 */
export function* restoreSession(tab: TabSession, action: { type: string }) {
  if (action.type === actions.restoreSessionCancelled.type) return;
  let attempt = 0;
  try {
    while (true) {
      const token = getStoredToken();
      if (!token) return;
      tab.token = token;
      yield* put(actions.setRestore('pending'));
      yield* put(actions.setLoading(true));
      try {
        const user = yield* call(authApi.fetchMe);
        // Пока шёл запрос, токен стёрли или заменили: ответ относится не к текущей сессии.
        if (getStoredToken() !== token) return;
        yield* put(actions.setUser(user));
        return;
      } catch (error) {
        // Отказ сервера в сессии уже закончил её (handleSessionEvent) — повторять нечего.
        if (isSessionEnded(error) || getStoredToken() !== token) return;
        if (!isServerUnavailable(error)) {
          yield* call(dropToken, tab, error);
          return;
        }
        console.warn('Сервер недоступен — вход будет восстановлен позже', error);
      }
      yield* put(actions.setLoading(false));
      yield* put(actions.setRestore('offline'));
      yield* call(waitToRetry, attempt);
      attempt += 1;
    }
  } finally {
    yield* put(actions.setLoading(false));
  }
}

/** Выход при конце сессии и одно сообщение. */
function* endSession() {
  yield* put(actions.logout({ keepToken: true }));
  yield* call(toast.info, SESSION_ENDED_TEXT, SESSION_ENDED_TOAST_MS);
}

/**
 * Токен в другой вкладке стёрт (выход) или записан (вход). Если у этой вкладки была сессия
 * (вошла или входит по токену), она закончилась — выход и сообщение один раз; а если в
 * хранилище теперь есть токен, вкладка входит с ним. Токен, который вкладка уже использует
 * (повторное событие), ничего не меняет.
 */
function* handleStorageChange(tab: TabSession) {
  const token = getStoredToken();
  if (token && token === tab.token) return;
  const isAuth = yield* select(selectors.selectUserIsAuth);
  const restore = yield* select(selectors.selectSessionRestore);
  if (isAuth || restore !== 'idle') {
    yield* put(actions.restoreSessionCancelled());
    yield* call(endSession);
  }
  tab.token = token;
  if (token) yield* put(actions.restoreSessionRequested());
}

/**
 * Событие сессии: отказ сервера в токене этой вкладки (клиент API его уже стёр) или смена
 * токена в другой вкладке.
 */
function* handleSessionEvent(tab: TabSession, source: SessionEvent) {
  if (source === 'elsewhere') {
    yield* call(handleStorageChange, tab);
    return;
  }
  yield* put(actions.restoreSessionCancelled());
  yield* call(endSession);
}

function sessionEventChannel() {
  return eventChannel<SessionEvent>((emit) => subscribeSessionEvents(emit), buffers.expanding(2));
}

/** Сбой при одном событии не должен останавливать вход и наблюдение за сессией. */
function* handleSessionEventSafely(tab: TabSession, source: SessionEvent) {
  try {
    yield* call(handleSessionEvent, tab, source);
  } catch (error) {
    console.error('Не удалось обработать конец сессии', error);
  }
}

/** События обрабатываются по очереди: второе видит результат первого. */
export function* watchSessionEnd(tab: TabSession) {
  const channel = yield* call(sessionEventChannel);
  try {
    while (true) {
      const source = yield* take(channel);
      yield* call(handleSessionEventSafely, tab, source);
    }
  } finally {
    channel.close();
  }
}
