// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/app/api/client';
import { UserFeature } from '../index';
import { AuthModal } from './AuthModal';

const api = vi.hoisted(() => ({
  login: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  fetchMe: vi.fn(),
  sendPasswordResetCode: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock('@/app/api', () => ({ authApi: api }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sentMessage = 'Если аккаунт с этой почтой есть, мы отправили на неё код.';
let root: Root | null = null;

function render() {
  const saga = createSagaMiddleware();
  const store = configureStore({
    reducer: { ...UserFeature.reducer },
    middleware: (gdm) => gdm({ thunk: false }).concat(saga),
  });
  saga.run(UserFeature.sagas.init);
  store.dispatch(UserFeature.actions.openAuthModal('login'));
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <Provider store={store}>
        <AuthModal />
      </Provider>,
    ),
  );
  return store;
}

const title = () => document.querySelector('[role="dialog"] h2')?.textContent;
const alertText = () => document.querySelector('form [role="alert"]')?.textContent ?? '';
const statusText = () => document.querySelector('[role="status"]')?.textContent ?? '';

function input(label: string): HTMLInputElement {
  const el = Array.from(document.querySelectorAll('label')).find((l) => l.textContent === label);
  if (!el) throw new Error(`no field ${label}`);
  return document.getElementById(el.htmlFor) as HTMLInputElement;
}

function button(text: string): HTMLButtonElement {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  if (!el) throw new Error(`no button ${text}`);
  return el;
}

function type(field: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(el: HTMLElement) {
  act(() => el.click());
}

/** Отправить форму и дождаться саги (ответы API — уже готовые промисы). */
async function submit() {
  await act(async () => {
    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Пройти секунды обратного отсчёта (каждая секунда — отдельный таймер после рендера). */
function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

async function openResetCodeStep() {
  api.sendPasswordResetCode.mockResolvedValue({ message: sentMessage });
  render();
  type(input('Почта или логин'), 'Anna@Example.com');
  click(button('Забыли пароль?'));
  await submit();
}

describe('восстановление пароля в окне входа', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.values(api).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('«Забыли пароль?» → код и новый пароль → снова вход с той же почтой', async () => {
    api.sendPasswordResetCode.mockResolvedValue({ message: sentMessage });
    api.resetPassword.mockResolvedValue({ message: 'Пароль изменён. Войдите с новым паролем.' });
    render();

    type(input('Почта или логин'), 'Anna@Example.com');
    type(input('Пароль'), 'wrong-guess');
    click(button('Забыли пароль?'));
    expect(title()).toBe('Восстановление пароля');
    expect(input('Почта').value).toBe('Anna@Example.com');

    await submit();
    expect(api.sendPasswordResetCode).toHaveBeenCalledWith('anna@example.com');
    expect(statusText()).toBe(sentMessage);
    // Неудачный пароль входа не попадает в поле нового пароля.
    expect(input('Новый пароль').value).toBe('');

    type(input('Код из письма'), '12-34-56');
    type(input('Новый пароль'), 'new-password');
    type(input('Повторите пароль'), 'new-password');
    await submit();

    expect(api.resetPassword).toHaveBeenCalledWith('anna@example.com', '123456', 'new-password');
    expect(title()).toBe('Вход');
    expect(statusText()).toBe('Пароль изменён. Войдите с новым паролем.');
    expect(input('Почта или логин').value).toBe('anna@example.com');
    expect(input('Пароль').value).toBe('');
  });

  it('несовпадающие пароли и ошибки сервера — понятным текстом', async () => {
    await openResetCodeStep();
    type(input('Код из письма'), '123456');
    type(input('Новый пароль'), 'new-password');
    type(input('Повторите пароль'), 'other-password');
    await submit();
    expect(alertText()).toBe('Пароли не совпадают');
    expect(api.resetPassword).not.toHaveBeenCalled();

    api.resetPassword.mockRejectedValue(new ApiRequestError(401, 'invalid verification code'));
    type(input('Повторите пароль'), 'new-password');
    await submit();
    expect(alertText()).toBe('Неверный код подтверждения');
    expect(title()).toBe('Восстановление пароля');
  });

  it('код можно отправить снова только через 30 секунд', async () => {
    await openResetCodeStep();
    expect(button('Отправить код снова через 30 с').disabled).toBe(true);

    tick(30);
    const resend = button('Отправить код снова');
    expect(resend.disabled).toBe(false);
    await act(async () => {
      resend.click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.sendPasswordResetCode).toHaveBeenCalledTimes(2);
    expect(button('Отправить код снова через 30 с').disabled).toBe(true);
  });

  it('из восстановления можно вернуться к почте и ко входу', async () => {
    await openResetCodeStep();
    type(input('Новый пароль'), 'new-password');
    type(input('Повторите пароль'), 'new-password');
    click(button('← Изменить почту'));
    expect(input('Почта').value).toBe('anna@example.com');

    await submit();
    expect(input('Новый пароль').value).toBe('');
    expect(input('Повторите пароль').value).toBe('');
    click(button('← Изменить почту'));

    click(button('← Вернуться ко входу'));
    expect(title()).toBe('Вход');
    expect(input('Почта или логин').value).toBe('anna@example.com');
  });
});
