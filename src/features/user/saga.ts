/**
 * Саги авторизации: вход по паролю, регистрация с кодом на email,
 * восстановление пароля по коду из письма, восстановление сессии.
 * @module user/saga
 */

import { takeLatest, put, call, select, all } from 'typed-redux-saga';
import { authApi } from '@/app/api';
import { apiErrorText } from '@/app/api/errors';
import { clearStoredToken, getStoredToken, setStoredToken } from '@/app/api/token';
import { checkField, emailSchema, passwordSchema, verificationCodeSchema } from './lib/profileSchemas';
import { actions } from './slice';
import { selectors } from './selectors';

const RESET_CODE_SENT = 'Если аккаунт с этой почтой есть, мы отправили на неё код. Проверьте входящие и папку «Спам».';
const PASSWORD_CHANGED = 'Пароль изменён. Войдите с новым паролем.';

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
      yield* put(actions.setError('Введите почту (или логин) и пароль'));
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
    const password = checkField(passwordSchema, form.password);
    if (!password.ok) {
      yield* put(actions.setError(password.error));
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

/** Восстановление пароля, шаг 1: код на почту (ответ одинаковый, есть ли такой аккаунт). */
function* handleSendResetCode() {
  yield* put(actions.setLoading(true));
  yield* put(actions.setError(undefined));

  try {
    const form = yield* select(selectors.selectAuthForm);
    const email = checkField(emailSchema, form.email);
    if (!email.ok) {
      yield* put(actions.setError(email.error));
      return;
    }

    const result = yield* call(authApi.sendPasswordResetCode, email.value);

    yield* put(actions.setFormField({ field: 'email', value: email.value }));
    yield* put(actions.setCodeSent(true));
    yield* put(actions.setSuccessMessage(result.message || RESET_CODE_SENT));
  } catch (error) {
    yield* put(actions.setError(apiErrorText(error, 'Не удалось отправить код')));
  } finally {
    yield* put(actions.setLoading(false));
  }
}

/** Восстановление пароля, шаг 2: код из письма и новый пароль, затем — обычный вход. */
function* handleResetPassword() {
  try {
    const form = yield* select(selectors.selectAuthForm);
    const code = checkField(verificationCodeSchema, form.code);
    if (!code.ok) {
      yield* put(actions.setError(code.error));
      return;
    }
    const password = checkField(passwordSchema, form.password);
    if (!password.ok) {
      yield* put(actions.setError(password.error));
      return;
    }
    if (form.password !== form.passwordRepeat) {
      yield* put(actions.setError('Пароли не совпадают'));
      return;
    }

    yield* put(actions.setLoading(true));
    yield* put(actions.setError(undefined));

    const result = yield* call(authApi.resetPassword, form.email.trim(), code.value, form.password);

    // Сам сброс не входит в аккаунт: вход — обычным способом, с новым паролем.
    yield* put(actions.passwordResetSucceeded(result.message || PASSWORD_CHANGED));
  } catch (error) {
    yield* put(actions.setError(apiErrorText(error, 'Не удалось сменить пароль')));
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
    takeLatest(actions.sendResetCodeRequested.type, handleSendResetCode),
    takeLatest(actions.resetPasswordRequested.type, handleResetPassword),
    takeLatest(actions.logout.type, handleLogout),
    takeLatest(actions.restoreSessionRequested.type, restoreSession),
  ]);
}
