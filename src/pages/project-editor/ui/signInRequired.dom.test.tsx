// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectSessionFeature } from '@/features/project-session';
import { UserFeature } from '@/features/user';
import { SignInRequired } from './SignInRequired';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function render(unsavedKept: boolean) {
  const store = configureStore({ reducer: { ...UserFeature.reducer, ...ProjectSessionFeature.reducer } });
  store.dispatch(ProjectSessionFeature.actions.openRequested('p1'));
  store.dispatch(ProjectSessionFeature.actions.signedOut({ unsavedKept }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      <Provider store={store}>
        <MemoryRouter>
          <SignInRequired />
        </MemoryRouter>
      </Provider>,
    ),
  );
  return { store, container };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('страница проекта без входа', () => {
  it('просит войти и открывает окно входа', () => {
    const { store, container } = render(false);

    expect(container.textContent).toContain('Войдите, чтобы открыть проект');
    expect(container.textContent).not.toContain('Несохранённые изменения');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/');

    const login = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Войти');
    act(() => login?.click());

    expect(UserFeature.selectors.selectIsAuthModalOpen(store.getState())).toBe(true);
    expect(UserFeature.selectors.selectAuthMode(store.getState())).toBe('login');
  });

  it('говорит, что несохранённые правки остались на устройстве', () => {
    const { container } = render(true);

    expect(container.textContent).toContain('Несохранённые изменения остались на этом устройстве');
  });
});
