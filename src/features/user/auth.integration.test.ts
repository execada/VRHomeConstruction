import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { ApiRequestError } from '@/app/api/client';
import { UserFeature } from './index';

const api = vi.hoisted(() => ({ login: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), fetchMe: vi.fn() }));
const token = vi.hoisted(() => ({ getStoredToken: vi.fn(), setStoredToken: vi.fn(), clearStoredToken: vi.fn() }));
vi.mock('@/app/api', () => ({ authApi: api }));
vi.mock('@/app/api/token', () => token);

const { actions, selectors } = UserFeature;
const user = { id: 'u1', name: 'Анна', email: 'anna@example.com' };
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...UserFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(UserFeature.sagas.init);
  return store;
}

function fillRegistration(store: ReturnType<typeof setup>) {
  store.dispatch(actions.openAuthModal('register'));
  store.dispatch(actions.setFormField({ field: 'name', value: 'Анна' }));
  store.dispatch(actions.setFormField({ field: 'email', value: ' anna@example.com ' }));
  store.dispatch(actions.setFormField({ field: 'password', value: 'secret1' }));
}

describe('регистрация с подтверждением почты', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(token).forEach((fn) => fn.mockReset());
  });

  it('передаёт токен заявки из ответа на отправку кода в подтверждение', async () => {
    api.sendCode.mockResolvedValue({ message: 'Код отправлен', token: 'request-token' });
    api.verifyCode.mockResolvedValue({ user, token: 'jwt' });
    const store = setup();

    fillRegistration(store);
    store.dispatch(actions.sendCodeRequested());
    await flush();
    expect(api.sendCode).toHaveBeenCalledWith('anna@example.com', { name: 'Анна', password: 'secret1' });
    expect(selectors.selectAuthStep(store.getState())).toBe('code');
    expect(selectors.selectRegistrationToken(store.getState())).toBe('request-token');

    store.dispatch(actions.setFormField({ field: 'code', value: '123456' }));
    store.dispatch(actions.verifyCodeRequested());
    await flush();

    expect(api.verifyCode).toHaveBeenCalledWith('anna@example.com', '123456', 'request-token');
    expect(token.setStoredToken).toHaveBeenCalledWith('jwt');
    expect(selectors.selectUserIsAuth(store.getState())).toBe(true);
    expect(selectors.selectRegistrationToken(store.getState())).toBeUndefined();
  });

  it('без токена заявки просит запросить код заново и не обращается к серверу', async () => {
    const store = setup();
    fillRegistration(store);
    store.dispatch(actions.setFormField({ field: 'code', value: '123456' }));

    store.dispatch(actions.verifyCodeRequested());
    await flush();

    expect(api.verifyCode).not.toHaveBeenCalled();
    expect(selectors.selectUserError(store.getState())).toBe('Запросите код подтверждения ещё раз');
  });

  it('переводит ответы сервера и не показывает технические тексты', async () => {
    const store = setup();
    fillRegistration(store);

    api.sendCode.mockRejectedValue(new ApiRequestError(409, 'email already registered'));
    store.dispatch(actions.sendCodeRequested());
    await flush();
    expect(selectors.selectUserError(store.getState())).toBe('Эта почта уже зарегистрирована');

    api.sendCode.mockRejectedValue(new Error('token: Too small: expected string to have >=1 characters'));
    store.dispatch(actions.sendCodeRequested());
    await flush();
    expect(selectors.selectUserError(store.getState())).toBe('Не удалось отправить код');
  });
});

describe('вход', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(token).forEach((fn) => fn.mockReset());
  });

  it('сохраняет токен и пользователя', async () => {
    api.login.mockResolvedValue({ user, token: 'jwt' });
    const store = setup();
    store.dispatch(actions.openAuthModal('login'));
    store.dispatch(actions.setFormField({ field: 'email', value: 'anna@example.com' }));
    store.dispatch(actions.setFormField({ field: 'password', value: 'secret1' }));

    store.dispatch(actions.loginRequested());
    await flush();

    expect(token.setStoredToken).toHaveBeenCalledWith('jwt');
    expect(selectors.selectUserAuthData(store.getState())).toEqual(user);
  });

  it('администратор входит по логину', async () => {
    const admin = { id: 'a1', name: 'Админ', email: '', username: 'execada', role: 'admin' };
    api.login.mockResolvedValue({ user: admin, token: 'jwt' });
    const store = setup();
    store.dispatch(actions.setFormField({ field: 'email', value: ' execada ' }));
    store.dispatch(actions.setFormField({ field: 'password', value: 'admin-pass' }));

    store.dispatch(actions.loginRequested());
    await flush();

    expect(api.login).toHaveBeenCalledWith('execada', 'admin-pass');
    expect(selectors.selectUserIsAdmin(store.getState())).toBe(true);
    expect(selectors.selectUserUsername(store.getState())).toBe('execada');
  });

  it('сообщает о блокировке после неудачных попыток', async () => {
    api.login.mockRejectedValue(new ApiRequestError(429, 'too many login attempts, try again later'));
    const store = setup();
    store.dispatch(actions.setFormField({ field: 'email', value: 'anna@example.com' }));
    store.dispatch(actions.setFormField({ field: 'password', value: 'wrong' }));

    store.dispatch(actions.loginRequested());
    await flush();

    expect(selectors.selectUserError(store.getState())).toContain('15 минут');
    expect(selectors.selectUserIsLoading(store.getState())).toBe(false);
  });

  it('восстанавливает сессию по сохранённому токену и сбрасывает недействительный', async () => {
    token.getStoredToken.mockReturnValue('jwt');
    api.fetchMe.mockResolvedValue(user);
    const store = setup();
    store.dispatch(actions.restoreSessionRequested());
    await flush();
    expect(selectors.selectUserIsAuth(store.getState())).toBe(true);

    api.fetchMe.mockRejectedValue(new ApiRequestError(401, 'invalid or expired token'));
    store.dispatch(actions.restoreSessionRequested());
    await flush();
    expect(token.clearStoredToken).toHaveBeenCalled();
    expect(selectors.selectUserIsAuth(store.getState())).toBe(false);
  });
});
