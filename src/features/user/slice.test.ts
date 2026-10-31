import { describe, expect, it } from 'vitest';
import { actions, reducer } from './slice';

const initial = () => reducer(undefined, { type: 'init' });
const user = { id: 'u1', name: 'Анна', email: 'anna@example.com' };

describe('user slice', () => {
  it('вход закрывает окно и очищает форму', () => {
    let state = reducer(initial(), actions.openAuthModal('register'));
    state = reducer(state, actions.setFormField({ field: 'email', value: 'anna@example.com' }));
    state = reducer(state, actions.setUser(user));
    expect(state).toMatchObject({ isAuth: true, authData: user, isAuthModalOpen: false, authStep: 'form' });
    expect(state.form.email).toBe('');
  });

  it('обновление профиля и выход', () => {
    let state = reducer(initial(), actions.setUser(user));
    state = reducer(state, actions.updateAuthData({ ...user, name: 'Анна П.' }));
    expect(state.authData?.name).toBe('Анна П.');
    state = reducer(state, actions.logout());
    expect(state.isAuth).toBe(false);
    expect(state.authData).toBeUndefined();
  });

  it('ошибка снимает индикатор загрузки', () => {
    let state = reducer(initial(), actions.setLoading(true));
    state = reducer(state, actions.setError('Неверный код'));
    expect(state).toMatchObject({ isLoading: false, error: 'Неверный код' });
  });

  it('шаги регистрации: код отправлен → шаг кода с подсказкой', () => {
    let state = reducer(initial(), actions.openAuthModal('register'));
    state = reducer(state, actions.setCodeSent(true));
    expect(state.authStep).toBe('code');
    expect(state.successMessage).toContain('Код отправлен');

    state = reducer(state, actions.setSuccessMessage('Письмо отправлено'));
    state = reducer(state, actions.setCodeSent(true));
    expect(state.successMessage).toBe('Письмо отправлено');

    state = reducer(state, actions.setCodeSent(false));
    expect(state.codeSent).toBe(false);
    state = reducer(state, actions.setAuthStep('form'));
    expect(state.authStep).toBe('form');
  });

  it('переключение режима и закрытие окна сбрасывают состояние формы', () => {
    let state = reducer(initial(), actions.openAuthModal('login'));
    state = reducer(state, actions.setError('Ошибка'));
    state = reducer(state, actions.setAuthMode('register'));
    expect(state).toMatchObject({ authMode: 'register', error: undefined, authStep: 'form' });

    state = reducer(state, actions.setFormField({ field: 'name', value: 'Анна' }));
    state = reducer(state, actions.closeAuthModal());
    expect(state.isAuthModalOpen).toBe(false);
    expect(state.form.name).toBe('');
  });

  it('запросы для саг не меняют состояние', () => {
    const state = initial();
    for (const action of [actions.loginRequested(), actions.sendCodeRequested(), actions.verifyCodeRequested(), actions.restoreSessionRequested()]) {
      expect(reducer(state, action)).toBe(state);
    }
  });
});
