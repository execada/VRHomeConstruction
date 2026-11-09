import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { ApiRequestError } from '@/app/api/client';
import { UserFeature } from './index';

const api = vi.hoisted(() => ({
  login: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  fetchMe: vi.fn(),
  sendPasswordResetCode: vi.fn(),
  resetPassword: vi.fn(),
}));
const token = vi.hoisted(() => ({ getStoredToken: vi.fn(), setStoredToken: vi.fn(), clearStoredToken: vi.fn() }));
vi.mock('@/app/api', () => ({ authApi: api }));
vi.mock('@/app/api/token', () => token);

const { actions, selectors } = UserFeature;
const flush = () => new Promise((r) => setTimeout(r, 0));
const sentMessage = 'Если аккаунт с этой почтой есть, мы отправили на неё код.';

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...UserFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(UserFeature.sagas.init);
  store.dispatch(actions.openAuthModal('login'));
  store.dispatch(actions.setAuthMode('reset'));
  return store;
}

type Store = ReturnType<typeof setup>;

function fill(store: Store, fields: Partial<Record<'email' | 'code' | 'password' | 'passwordRepeat', string>>) {
  for (const [field, value] of Object.entries(fields)) {
    store.dispatch(actions.setFormField({ field: field as keyof typeof fields, value: value ?? '' }));
  }
}

async function requestCode(store: Store, email = ' Anna@Example.com ') {
  api.sendPasswordResetCode.mockResolvedValue({ message: sentMessage });
  fill(store, { email });
  store.dispatch(actions.sendResetCodeRequested());
  await flush();
}

const errorOf = (store: Store) => selectors.selectUserError(store.getState());

describe('восстановление пароля', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(token).forEach((fn) => fn.mockReset());
  });

  it('код на почту → код и новый пароль → вход с новым паролем', async () => {
    const store = setup();
    await requestCode(store);

    expect(api.sendPasswordResetCode).toHaveBeenCalledWith('anna@example.com');
    expect(selectors.selectAuthStep(store.getState())).toBe('code');
    expect(selectors.selectSuccessMessage(store.getState())).toBe(sentMessage);
    expect(selectors.selectAuthForm(store.getState()).email).toBe('anna@example.com');

    api.resetPassword.mockResolvedValue({ message: 'Пароль изменён. Войдите с новым паролем.' });
    fill(store, { code: ' 123456 ', password: 'new-password', passwordRepeat: 'new-password' });
    store.dispatch(actions.resetPasswordRequested());
    await flush();

    expect(api.resetPassword).toHaveBeenCalledWith('anna@example.com', '123456', 'new-password');
    expect(selectors.selectAuthMode(store.getState())).toBe('login');
    expect(selectors.selectSuccessMessage(store.getState())).toBe('Пароль изменён. Войдите с новым паролем.');
    expect(selectors.selectAuthForm(store.getState())).toMatchObject({ email: 'anna@example.com', password: '' });
    // Сброс не входит в аккаунт сам: входят обычным способом.
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
    expect(token.setStoredToken).not.toHaveBeenCalled();
  });

  it('без корректной почты код не запрашивается', async () => {
    const store = setup();
    fill(store, { email: 'not-an-email' });
    store.dispatch(actions.sendResetCodeRequested());
    await flush();

    expect(api.sendPasswordResetCode).not.toHaveBeenCalled();
    expect(errorOf(store)).toBe('Введите корректный адрес почты');
    expect(selectors.selectAuthStep(store.getState())).toBe('form');
  });

  it('проверяет код и новый пароль до запроса', async () => {
    const store = setup();
    await requestCode(store);
    const cases: Array<[Parameters<typeof fill>[1], string]> = [
      [{ code: '12', password: 'new-password', passwordRepeat: 'new-password' }, 'Код — 6 цифр из письма'],
      [{ code: '123456', password: '12345', passwordRepeat: '12345' }, 'Пароль должен быть не короче 6 символов'],
      [{ code: '123456', password: 'new-password', passwordRepeat: 'new-passw0rd' }, 'Пароли не совпадают'],
    ];
    for (const [fields, message] of cases) {
      fill(store, fields);
      store.dispatch(actions.resetPasswordRequested());
      await flush();
      expect(errorOf(store)).toBe(message);
    }
    expect(api.resetPassword).not.toHaveBeenCalled();
    expect(selectors.selectUserIsLoading(store.getState())).toBe(false);
  });

  it('переводит ответы сервера по-русски', async () => {
    const store = setup();
    await requestCode(store);
    fill(store, { code: '123456', password: 'new-password', passwordRepeat: 'new-password' });

    const answers: Array<[ApiRequestError | Error, string]> = [
      [new ApiRequestError(401, 'invalid verification code'), 'Неверный код подтверждения'],
      [new ApiRequestError(401, 'verification code expired, request a new one'), 'Срок действия кода истёк — запросите новый'],
      [new ApiRequestError(429, 'too many invalid attempts, request a new code'), 'Слишком много попыток — запросите новый код'],
      [new ApiRequestError(429, 'too many password reset attempts, try again later'), 'Слишком много неверных кодов — попробуйте через час'],
      [new Error('message: Invalid input'), 'Не удалось сменить пароль'],
    ];
    for (const [error, message] of answers) {
      api.resetPassword.mockRejectedValueOnce(error);
      store.dispatch(actions.resetPasswordRequested());
      await flush();
      expect(errorOf(store)).toBe(message);
      expect(selectors.selectAuthMode(store.getState())).toBe('reset');
    }

    api.sendPasswordResetCode.mockRejectedValueOnce(new ApiRequestError(429, 'code was sent recently, wait 30 seconds before retrying'));
    store.dispatch(actions.sendResetCodeRequested());
    await flush();
    expect(errorOf(store)).toBe('Код уже отправлен — повторить можно через 30 секунд');
  });
});
