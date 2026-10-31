/**
 * Саги авторизации: вход по паролю, регистрация с кодом на email,
 * восстановление сессии.
 * @module user/saga
 */

import { takeLatest, put, call, select, all } from 'typed-redux-saga';
import { authApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import { clearStoredToken, getStoredToken, setStoredToken } from '@/app/api/token';
import { actions } from './slice';
import { selectors } from './selectors';

/** Восстановить пользователя по сохранённому JWT */
export function* restoreSession() {
  const token = getStoredToken();
  if (!token) {
    return;
  }

  try {
    yield* put(actions.setLoading(true));
    const user = yield* call(authApi.fetchMe);
    yield* put(actions.setUser(user));
  } catch {
    clearStoredToken();
    yield* put(actions.logout());
  } finally {
    yield* put(actions.setLoading(false));
  }
}

/** Вход по email и паролю — сразу, без кода подтверждения. */
function* handleLogin() {
  yield* put(actions.setLoading(true));
  yield* put(actions.setError(undefined));

  try {
    const form = yield* select(selectors.selectAuthForm);

    if (!form.email.trim() || !form.password) {
      yield* put(actions.setError('Введите email и пароль'));
      return;
    }

    const { user, token } = yield* call(authApi.login, form.email.trim(), form.password);

    setStoredToken(token);
    // Данные пользователя подгружает корневая сага по событию setUser.
    yield* put(actions.setUser(user));
  } catch (error) {
    yield* put(actions.setError(apiErrorText(error, 'Не удалось войти')));
  } finally {
    yield* put(actions.setLoading(false));
  }
}

/** Регистрация, шаг 1: отправить код подтверждения на email. */
function* handleSendCode() {
  yield* put(actions.setLoading(true));
  yield* put(actions.setError(undefined));

  try {
    const form = yield* select(selectors.selectAuthForm);

    if (!form.email.trim() || !form.password) {
      yield* put(actions.setError('Введите email и пароль'));
      return;
    }
    if (!form.name.trim()) {
      yield* put(actions.setError('Введите имя'));
      return;
    }
    if (form.password.length < 6) {
      yield* put(actions.setError('Пароль должен быть не короче 6 символов'));
      return;
    }

    const result = yield* call(authApi.sendCode, form.email.trim(), {
      name: form.name.trim(),
      password: form.password,
    });

    yield* put(actions.setRegistrationToken(result.token));
    yield* put(actions.setCodeSent(true));
    if (result.message) {
      yield* put(actions.setSuccessMessage(result.message));
    }
  } catch (error) {
    yield* put(actions.setError(apiErrorText(error, 'Не удалось отправить код')));
  } finally {
    yield* put(actions.setLoading(false));
  }
}

/** Регистрация, шаг 2: подтвердить код и создать аккаунт. */
function* handleVerifyCode() {
  try {
    const form = yield* select(selectors.selectAuthForm);

    if (!form.email.trim() || !form.code.trim()) {
      yield* put(actions.setError('Введите код из письма'));
      return;
    }

    if (form.code.trim().length !== 6) {
      yield* put(actions.setError('Код должен содержать 6 цифр'));
      return;
    }

    // Токен заявки выдаётся при отправке кода; без него (например, после перезагрузки) код не подтвердить.
    const registrationToken = yield* select(selectors.selectRegistrationToken);
    if (!registrationToken) {
      yield* put(actions.setError('Запросите код подтверждения ещё раз'));
      return;
    }

    yield* put(actions.setLoading(true));
    yield* put(actions.setError(undefined));

    const { user, token } = yield* call(authApi.verifyCode, form.email.trim(), form.code.trim(), registrationToken);

    setStoredToken(token);
    // Данные пользователя подгружает корневая сага по событию setUser.
    yield* put(actions.setUser(user));
  } catch (error) {
    yield* put(actions.setError(apiErrorText(error, 'Не удалось подтвердить код')));
  } finally {
    yield* put(actions.setLoading(false));
  }
}

function* handleLogout() {
  yield* call(clearStoredToken);
}

export function* initSaga() {
  yield all([
    takeLatest(actions.loginRequested.type, handleLogin),
    takeLatest(actions.sendCodeRequested.type, handleSendCode),
    takeLatest(actions.verifyCodeRequested.type, handleVerifyCode),
    takeLatest(actions.logout.type, handleLogout),
    takeLatest(actions.restoreSessionRequested.type, restoreSession),
  ]);
}
