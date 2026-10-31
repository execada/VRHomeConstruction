// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/app/api/client';
import { actions, reducer } from '../slice';
import { ChangeEmailDialog } from './ChangeEmailDialog';

const api = vi.hoisted(() => ({ sendEmailChangeCode: vi.fn(), verifyEmailChange: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('@/app/api', () => ({ authApi: api }));
vi.mock('@/shared/lib/toast', () => ({ toast }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const user = { id: 'u1', name: 'Анна', email: 'old@example.com' };
let root: Root | null = null;

function render(onClose = vi.fn()) {
  const store = configureStore({ reducer: { user: reducer } });
  store.dispatch(actions.setUser(user));
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <Provider store={store}>
        <ChangeEmailDialog currentEmail={user.email} onClose={onClose} />
      </Provider>,
    ),
  );
  return { store, onClose };
}

function input(label: string): HTMLInputElement {
  const el = Array.from(document.querySelectorAll('label')).find((l) => l.textContent?.includes(label));
  if (!el) throw new Error(`no field ${label}`);
  return document.getElementById(el.htmlFor) as HTMLInputElement;
}

function noteOf(field: HTMLInputElement): string {
  const id = field.getAttribute('aria-describedby');
  return (id && document.getElementById(id)?.textContent) || '';
}

function type(field: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () => {
    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('смена почты', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    Object.values(toast).forEach((fn) => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
  });

  it('без текущего пароля код не запрашивается', async () => {
    render();
    type(input('Новая почта'), 'new@example.com');
    await submit();

    expect(api.sendEmailChangeCode).not.toHaveBeenCalled();
    expect(noteOf(input('Текущий пароль'))).toBe('Введите текущий пароль');
  });

  it('неверный пароль показывается под полем пароля', async () => {
    api.sendEmailChangeCode.mockRejectedValue(new ApiRequestError(403, 'invalid password'));
    render();
    type(input('Новая почта'), 'new@example.com');
    type(input('Текущий пароль'), 'wrong-password');
    await submit();

    expect(api.sendEmailChangeCode).toHaveBeenCalledWith('new@example.com', 'wrong-password');
    expect(noteOf(input('Текущий пароль'))).toBe('Неверный пароль');
    expect(noteOf(input('Новая почта'))).toBe('');
  });

  it('код из письма меняет почту в профиле', async () => {
    api.sendEmailChangeCode.mockResolvedValue({ message: 'ok' });
    api.verifyEmailChange.mockResolvedValue({ ...user, email: 'new@example.com' });
    const { store, onClose } = render();

    type(input('Новая почта'), ' New@Example.com ');
    type(input('Текущий пароль'), 'secret123');
    await submit();
    type(input('Код из письма'), '12-34-56');
    await submit();

    expect(api.verifyEmailChange).toHaveBeenCalledWith('new@example.com', '123456');
    expect(store.getState().user.authData?.email).toBe('new@example.com');
    expect(toast.success).toHaveBeenCalledWith('Почта изменена');
    expect(onClose).toHaveBeenCalled();
  });
});
